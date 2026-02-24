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

// Track which agents are "running" (in direct mode, just a flag)
const runningAgents = new Set<string>();

// Track Docker container processes (when using container mode)
interface AgentProcess {
  agent_id: string;
  container_name: string;
  process: ChildProcess;
  ipc_dir: string;
}
const containerAgents = new Map<string, AgentProcess>();

let runtime: AgentRuntime | null = null;

export function getRuntime(): AgentRuntime {
  if (!runtime) {
    runtime = new AgentRuntime();
  }
  return runtime;
}

function isDockerAvailable(): boolean {
  try {
    const { execSync } = require('child_process');
    execSync('docker info', { stdio: 'ignore', timeout: 3000 });
    // Also check if vault-agent image exists
    const result = execSync('docker images -q vault-agent:latest', { encoding: 'utf8', timeout: 3000 });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

export class AgentRuntime {
  private dataDir: string;
  private dockerAvailable: boolean;

  constructor() {
    this.dataDir = path.join(process.cwd(), 'data');
    fs.mkdirSync(path.join(this.dataDir, 'ipc'), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, 'workspaces'), { recursive: true });
    this.dockerAvailable = isDockerAvailable();
    logger.info('Agent runtime mode: %s', this.dockerAvailable ? 'Docker containers' : 'Direct (no Docker)');
  }

  async startAgent(agent: Agent): Promise<void> {
    if (runningAgents.has(agent.id)) {
      logger.warn('Agent %s already running', agent.id);
      return;
    }

    if (this.dockerAvailable) {
      await this.startContainer(agent);
    } else {
      // Direct mode — just mark as running, messages will use Claude CLI
      runningAgents.add(agent.id);
      db.updateAgentStatus(agent.id, 'running', null);
      broadcast({ type: 'agent_status', agent_id: agent.id, status: 'running' });
      db.createActivity(agent.id, 'agent_started', 'Direct mode (no Docker)');
      logger.info('Agent %s started in direct mode', agent.name);
    }
  }

  async sendMessage(
    agent: Agent,
    conversation: Conversation,
    content: string,
    messageId: string,
    onChunk: (chunk: string, done: boolean) => void,
  ): Promise<void> {
    const containerProc = containerAgents.get(agent.id);

    if (containerProc) {
      // Container mode: write to IPC
      const msgFile = path.join(containerProc.ipc_dir, 'input', `${Date.now()}-${uuid()}.json`);
      fs.writeFileSync(msgFile, JSON.stringify({
        type: 'message',
        conversation_id: conversation.id,
        content,
      }));
      return;
    }

    // Direct mode: run Claude CLI
    await this.runDirect(agent, conversation, content, messageId, onChunk);
  }

  private async runDirect(
    agent: Agent,
    conversation: Conversation,
    content: string,
    messageId: string,
    onChunk: (chunk: string, done: boolean) => void,
  ): Promise<void> {
    const { claudeCode } = await import('../agent/claude-sdk');

    let fullResponse = '';

    try {
      db.createActivity(agent.id, 'message_processing', `Sending to ${agent.model}`);

      await claudeCode({
        prompt: content,
        systemPrompt: agent.system_prompt || undefined,
        model: agent.model,
        onChunk: (text) => {
          fullResponse += text;
          onChunk(text, false);
        },
      });

      // Persist the full response to the DB
      if (fullResponse) {
        db.updateMessageContent(messageId, fullResponse);
      }

      onChunk('', true);
      db.createActivity(agent.id, 'response_complete', `${fullResponse.length} chars`);

    } catch (err: any) {
      logger.error('Direct mode error for agent %s: %s', agent.name, err.message);
      const errorText = `Error: ${err.message}`;
      db.updateMessageContent(messageId, errorText);
      onChunk(errorText, true);
      db.createActivity(agent.id, 'error', err.message, 'failed');
    }
  }

  async stopAgent(agentId: string): Promise<void> {
    // Container mode
    const proc = containerAgents.get(agentId);
    if (proc) {
      const closeSentinel = path.join(proc.ipc_dir, 'input', '_close');
      fs.writeFileSync(closeSentinel, '');
      db.updateAgentStatus(agentId, 'stopping');
      broadcast({ type: 'agent_status', agent_id: agentId, status: 'stopping' });
      setTimeout(() => {
        if (containerAgents.has(agentId)) {
          this.killAgent(agentId);
        }
      }, 10000);
      return;
    }

    // Direct mode
    runningAgents.delete(agentId);
    db.updateAgentStatus(agentId, 'stopped', null);
    broadcast({ type: 'agent_status', agent_id: agentId, status: 'stopped' });
    db.createActivity(agentId, 'agent_stopped', 'Stopped');
  }

  async killAgent(agentId: string): Promise<void> {
    // Container mode
    const proc = containerAgents.get(agentId);
    if (proc) {
      try {
        spawn('docker', ['rm', '--force', proc.container_name]);
      } catch { /* may already be gone */ }
      proc.process.kill('SIGKILL');
      containerAgents.delete(agentId);
    }

    // Either mode
    runningAgents.delete(agentId);
    db.updateAgentStatus(agentId, 'stopped', null);
    broadcast({ type: 'agent_status', agent_id: agentId, status: 'stopped' });
    db.createActivity(agentId, 'force_killed', 'Kill switch activated');
  }

  // ─── Docker Container Mode ───────────────────────────────────────

  private async startContainer(agent: Agent): Promise<void> {
    const containerName = `vault-agent-${agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
    const ipcDir = path.join(this.dataDir, 'ipc', agent.id);
    const workspaceDir = path.join(this.dataDir, 'workspaces', agent.id);

    fs.mkdirSync(path.join(ipcDir, 'input'), { recursive: true });
    fs.mkdirSync(path.join(ipcDir, 'output'), { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });

    db.updateAgentStatus(agent.id, 'starting');
    broadcast({ type: 'agent_status', agent_id: agent.id, status: 'starting' });

    try {
      const args = [
        'run', '--rm', '--name', containerName, '-i',
        '-v', `${workspaceDir}:/workspace/group`,
        '-v', `${ipcDir}:/workspace/ipc`,
        '--memory', '512m', '--cpus', '1',
        ...(agent.permissions.network ? [] : ['--network', 'none']),
        '--user', 'node',
        'vault-agent:latest',
      ];

      const proc = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });

      const agentProc: AgentProcess = {
        agent_id: agent.id,
        container_name: containerName,
        process: proc,
        ipc_dir: ipcDir,
      };

      containerAgents.set(agent.id, agentProc);
      runningAgents.add(agent.id);

      // Send config via stdin
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

      let buffer = '';
      proc.stdout!.on('data', (data: Buffer) => {
        buffer += data.toString();
        this.parseOutputStream(agent.id, buffer, (_parsed, remaining) => {
          buffer = remaining;
        });
      });

      proc.stderr!.on('data', (data: Buffer) => {
        logger.warn('Agent %s stderr: %s', agent.id, data.toString().trim());
      });

      proc.on('close', (code) => {
        containerAgents.delete(agent.id);
        runningAgents.delete(agent.id);
        db.updateAgentStatus(agent.id, 'stopped', null);
        broadcast({ type: 'agent_status', agent_id: agent.id, status: 'stopped' });
        db.createActivity(agent.id, 'container_stopped', `Exit code: ${code}`);
      });

      proc.on('error', (err) => {
        containerAgents.delete(agent.id);
        runningAgents.delete(agent.id);
        db.updateAgentStatus(agent.id, 'error', null);
        broadcast({ type: 'error', message: `Container error: ${err.message}`, agent_id: agent.id });
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
      if (endIdx === -1) break;

      const output = remaining.substring(startIdx + OUTPUT_START_MARKER.length, endIdx).trim();
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
    for (const key of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_API_KEY']) {
      if (process.env[key]) secrets[key] = process.env[key]!;
    }
    return secrets;
  }
}
