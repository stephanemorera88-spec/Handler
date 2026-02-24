import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import type { Agent, Conversation } from '@vault/shared';
import * as db from '../db';
import { broadcast } from '../ws/handler';
import { logger } from '../logger';

const OUTPUT_START_MARKER = '---VAULT_OUTPUT_START---';
const OUTPUT_END_MARKER = '---VAULT_OUTPUT_END---';

interface AgentProcess {
  agent_id: string;
  container_name: string;
  process: ChildProcess;
  ipc_dir: string;
}

const activeAgents = new Map<string, AgentProcess>();

let runtime: AgentRuntime | null = null;

export function getRuntime(): AgentRuntime {
  if (!runtime) {
    runtime = new AgentRuntime();
  }
  return runtime;
}

export class AgentRuntime {
  private dataDir: string;

  constructor() {
    this.dataDir = path.join(process.cwd(), 'data');
    fs.mkdirSync(path.join(this.dataDir, 'ipc'), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'workspaces'), { recursive: true });
  }

  async startAgent(agent: Agent): Promise<void> {
    if (activeAgents.has(agent.id)) {
      logger.warn('Agent %s already running', agent.id);
      return;
    }

    const containerName = `vault-agent-${agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
    const ipcDir = path.join(this.dataDir, 'ipc', agent.id);
    const workspaceDir = path.join(this.dataDir, 'workspaces', agent.id);

    // Create IPC directories
    fs.mkdirSync(path.join(ipcDir, 'input'), { recursive: true });
    fs.mkdirSync(path.join(ipcDir, 'output'), { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });

    db.updateAgentStatus(agent.id, 'starting');
    broadcast({ type: 'agent_status', agent_id: agent.id, status: 'starting' });

    try {
      const args = [
        'run', '--rm',
        '--name', containerName,
        '-i',
        // Mount workspace and IPC
        '-v', `${workspaceDir}:/workspace/group`,
        '-v', `${ipcDir}:/workspace/ipc`,
        // Resource limits
        '--memory', '512m',
        '--cpus', '1',
        // No network by default
        ...(agent.permissions.network ? [] : ['--network', 'none']),
        // Non-root
        '--user', 'node',
        // Image
        'vault-agent:latest',
      ];

      const proc = spawn('docker', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const agentProc: AgentProcess = {
        agent_id: agent.id,
        container_name: containerName,
        process: proc,
        ipc_dir: ipcDir,
      };

      activeAgents.set(agent.id, agentProc);

      // Send initial config via stdin
      const containerInput = {
        agent_id: agent.id,
        agent_name: agent.name,
        system_prompt: agent.system_prompt,
        model: agent.model,
        provider: agent.provider,
        config: agent.config,
        secrets: this.readSecrets(),
      };
      proc.stdin!.write(JSON.stringify(containerInput));
      proc.stdin!.end();

      // Stream stdout for output markers
      let buffer = '';
      proc.stdout!.on('data', (data: Buffer) => {
        buffer += data.toString();
        this.parseOutputStream(agent.id, buffer, (parsed, remaining) => {
          buffer = remaining;
        });
      });

      proc.stderr!.on('data', (data: Buffer) => {
        logger.warn('Agent %s stderr: %s', agent.id, data.toString().trim());
      });

      proc.on('close', (code) => {
        activeAgents.delete(agent.id);
        db.updateAgentStatus(agent.id, 'stopped', null);
        broadcast({ type: 'agent_status', agent_id: agent.id, status: 'stopped' });
        db.createActivity(agent.id, 'container_stopped', `Exit code: ${code}`);
        logger.info('Agent %s container stopped (code %s)', agent.id, String(code));
      });

      proc.on('error', (err) => {
        activeAgents.delete(agent.id);
        db.updateAgentStatus(agent.id, 'error', null);
        broadcast({ type: 'agent_status', agent_id: agent.id, status: 'error' });
        broadcast({ type: 'error', message: `Container error: ${err.message}`, agent_id: agent.id });
        logger.error('Agent %s container error: %s', agent.id, err.message);
      });

      db.updateAgentStatus(agent.id, 'running', containerName);
      broadcast({ type: 'agent_status', agent_id: agent.id, status: 'running', container_id: containerName });
      db.createActivity(agent.id, 'container_started', `Container: ${containerName}`);

    } catch (err: any) {
      db.updateAgentStatus(agent.id, 'error');
      broadcast({ type: 'agent_status', agent_id: agent.id, status: 'error' });
      throw err;
    }
  }

  async sendMessage(
    agent: Agent,
    conversation: Conversation,
    content: string,
    onChunk: (chunk: string, done: boolean) => void,
  ): Promise<void> {
    const proc = activeAgents.get(agent.id);

    if (!proc) {
      // Agent not running — run in direct mode (no container)
      await this.runDirect(agent, conversation, content, onChunk);
      return;
    }

    // Write message to IPC input directory
    const msgFile = path.join(proc.ipc_dir, 'input', `${Date.now()}-${uuid()}.json`);
    fs.writeFileSync(msgFile, JSON.stringify({
      type: 'message',
      conversation_id: conversation.id,
      content,
    }));

    // Wait for response via stdout parsing
    // The container's agent-runner will pick up the IPC file and process it
    // Response comes back through the stdout stream which is already being monitored
    onChunk('', false); // Signal that we're processing
  }

  async runDirect(
    agent: Agent,
    conversation: Conversation,
    content: string,
    onChunk: (chunk: string, done: boolean) => void,
  ): Promise<void> {
    // Direct mode: run Claude SDK without Docker for development
    // This uses the host machine's API key and runs without isolation
    const { claudeCode } = await import('../agent/claude-sdk');

    let fullResponse = '';

    try {
      db.createActivity(agent.id, 'message_sent', `Direct mode — no container`);

      const result = await claudeCode({
        prompt: content,
        systemPrompt: agent.system_prompt,
        model: agent.model,
        onChunk: (text) => {
          fullResponse += text;
          onChunk(text, false);
        },
      });

      // Store the full response
      db.updateMessageContent(
        // Get the last assistant message in this conversation
        db.listMessages(conversation.id, 1, 0).data.length > 0
          ? db.listMessages(conversation.id, 100, 0).data.filter(m => m.role === 'assistant').pop()?.id || ''
          : '',
        fullResponse || result,
      );

      onChunk('', true); // Signal done

      // Record usage
      if (result) {
        db.createActivity(agent.id, 'response_complete', `${fullResponse.length} chars`);
      }
    } catch (err: any) {
      onChunk(`\n\nError: ${err.message}`, true);
      db.createActivity(agent.id, 'error', err.message, 'failed');
    }
  }

  async stopAgent(agentId: string): Promise<void> {
    const proc = activeAgents.get(agentId);
    if (!proc) return;

    // Graceful stop: write close sentinel to IPC
    const closeSentinel = path.join(proc.ipc_dir, 'input', '_close');
    fs.writeFileSync(closeSentinel, '');

    db.updateAgentStatus(agentId, 'stopping');
    broadcast({ type: 'agent_status', agent_id: agentId, status: 'stopping' });

    // Wait for graceful shutdown, then force kill after 10s
    setTimeout(() => {
      if (activeAgents.has(agentId)) {
        this.killAgent(agentId);
      }
    }, 10000);
  }

  async killAgent(agentId: string): Promise<void> {
    const proc = activeAgents.get(agentId);
    if (!proc) return;

    try {
      // Force kill container
      spawn('docker', ['rm', '--force', proc.container_name]);
    } catch {
      // Container may have already exited
    }

    proc.process.kill('SIGKILL');
    activeAgents.delete(agentId);
    db.updateAgentStatus(agentId, 'stopped', null);
    broadcast({ type: 'agent_status', agent_id: agentId, status: 'stopped' });
    db.createActivity(agentId, 'force_killed', 'Kill switch activated');
  }

  private parseOutputStream(
    agentId: string,
    buffer: string,
    callback: (parsed: string | null, remaining: string) => void,
  ) {
    let remaining = buffer;
    while (true) {
      const startIdx = remaining.indexOf(OUTPUT_START_MARKER);
      if (startIdx === -1) break;

      const endIdx = remaining.indexOf(OUTPUT_END_MARKER, startIdx);
      if (endIdx === -1) break; // Incomplete — wait for more data

      const output = remaining.substring(
        startIdx + OUTPUT_START_MARKER.length,
        endIdx,
      ).trim();

      remaining = remaining.substring(endIdx + OUTPUT_END_MARKER.length);

      try {
        const parsed = JSON.parse(output);
        if (parsed.result) {
          broadcast({
            type: 'message_chunk',
            conversation_id: parsed.conversation_id || '',
            message_id: parsed.message_id || '',
            role: 'assistant',
            content: parsed.result,
            content_type: 'markdown',
            done: true,
          });
        }
      } catch {
        logger.warn('Failed to parse agent output: %s', output.substring(0, 200));
      }
    }
    callback(null, remaining);
  }

  private readSecrets(): Record<string, string> {
    const secrets: Record<string, string> = {};
    const envKeys = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_API_KEY'];
    for (const key of envKeys) {
      if (process.env[key]) {
        secrets[key] = process.env[key]!;
      }
    }
    return secrets;
  }
}
