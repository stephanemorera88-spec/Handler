import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import type { Agent, Conversation } from '@handler/shared';
import * as db from '../db';
import { broadcast } from '../ws/handler';
import { sendToAgent, disconnectAgent } from '../ws/agent-handler';
import { logger } from '../logger';

/**
 * Build conversation context by prepending recent history to the current message.
 * Agents see previous rounds but NOT the current round's parallel responses
 * (since agents respond in parallel, current-round placeholders are empty and filtered out).
 */
export function buildConversationContext(
  conversationId: string,
  currentAgentName: string,
  currentMessage: string,
  isGroup: boolean = false,
): string {
  const { total } = db.listMessages(conversationId, 1, 0);
  if (total === 0) return currentMessage;

  const offset = Math.max(0, total - 50);
  const { data: messages } = db.listMessages(conversationId, 50, offset);

  // Skip empty placeholder messages (assistant messages with no content yet)
  const meaningful = messages.filter(
    (m) => m.role === 'user' || (m.role === 'assistant' && m.content.trim()),
  );

  // If no completed assistant responses exist, no history to inject
  if (!meaningful.some((m) => m.role === 'assistant')) return currentMessage;

  const header = isGroup
    ? `[Group Chat — you are ${currentAgentName}]`
    : `[Conversation History — you are ${currentAgentName}]`;

  const lines: string[] = [header];

  for (const msg of meaningful) {
    if (msg.role === 'user') {
      lines.push(`User: ${msg.content}`);
    } else {
      const name = msg.metadata?.agent_name || 'Assistant';
      lines.push(`${name}: ${msg.content}`);
    }
  }

  return lines.join('\n');
}

const OUTPUT_START_MARKER = '---HANDLER_OUTPUT_START---';
const OUTPUT_END_MARKER = '---HANDLER_OUTPUT_END---';

// Track which agents are "running" (in direct mode, just a flag)
const runningAgents = new Set<string>();

// Global concurrency limit
const MAX_CONCURRENT_AGENTS = 5;

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
    // Also check if handler-agent image exists
    const result = execSync('docker images -q handler-agent:latest', { encoding: 'utf8', timeout: 3000 });
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

  getRunningCount(): number {
    return runningAgents.size;
  }

  isAgentRunning(agentId: string): boolean {
    return runningAgents.has(agentId);
  }

  async startAgent(agent: Agent): Promise<void> {
    // External agents are started by the agent process connecting via WebSocket
    if (agent.connection_type === 'external') {
      logger.info('External agent %s — start is managed by the external process', agent.name);
      return;
    }

    if (runningAgents.has(agent.id)) {
      logger.warn('Agent %s already running', agent.id);
      return;
    }

    if (runningAgents.size >= MAX_CONCURRENT_AGENTS) {
      throw new Error(`Concurrent agent limit reached (${MAX_CONCURRENT_AGENTS}). Stop another agent first.`);
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
    // External agent: route via WebSocket, response arrives async
    if (agent.connection_type === 'external') {
      logger.info('Routing message to external agent %s (msg: %s)', agent.id, messageId);
      const sent = sendToAgent(agent.id, {
        type: 'server.message',
        request_id: messageId,
        conversation_id: conversation.id,
        content,
      });
      logger.info('sendToAgent result: %s', sent);
      if (!sent) {
        const errorText = 'Agent is not connected. Start your external agent process to send messages.';
        db.updateMessageContent(messageId, errorText);
        onChunk(errorText, true);
      }
      return; // Response arrives async via agent-handler
    }

    // Approval gate: if agent requires approval, hold until approved
    if (agent.permissions.requires_approval) {
      const approved = await this.requestApproval(agent, 'send_message', content);
      if (!approved) {
        const deniedText = 'Message denied by user.';
        db.updateMessageContent(messageId, deniedText);
        onChunk(deniedText, true);
        return;
      }
    }

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

  private requestApproval(agent: Agent, actionType: string, actionDetail: string): Promise<boolean> {
    return new Promise((resolve) => {
      const approval = db.createApproval(agent.id, actionType, actionDetail);

      // Notify all clients
      broadcast({
        type: 'approval_request',
        approval_id: approval.id,
        agent_id: agent.id,
        action_type: actionType,
        action_detail: actionDetail,
      });

      db.createActivity(agent.id, 'approval_requested', `Waiting for approval: ${actionType}`);

      // Poll for resolution
      const poll = setInterval(() => {
        const updated = db.getApproval(approval.id);
        if (updated && updated.status !== 'pending') {
          clearInterval(poll);
          resolve(updated.status === 'approved');
        }
      }, 500);

      // Auto-deny after 5 minutes
      setTimeout(() => {
        clearInterval(poll);
        const current = db.getApproval(approval.id);
        if (current && current.status === 'pending') {
          db.resolveApproval(approval.id, 'denied');
          resolve(false);
        }
      }, 300000);
    });
  }

  private async runDirect(
    agent: Agent,
    conversation: Conversation,
    content: string,
    messageId: string,
    onChunk: (chunk: string, done: boolean) => void,
  ): Promise<void> {
    let fullResponse = '';

    // Check cost limit before sending
    const currentUsage = db.getUsageSummary(agent.id);
    if (currentUsage.total_cost_usd >= agent.permissions.max_cost_usd) {
      const errorText = `Cost limit reached ($${currentUsage.total_cost_usd.toFixed(4)} / $${agent.permissions.max_cost_usd.toFixed(2)}). Increase the agent's cost limit to continue.`;
      db.updateMessageContent(messageId, errorText);
      onChunk(errorText, true);
      db.createActivity(agent.id, 'cost_limit_reached', errorText, 'failed');
      return;
    }

    // Common callbacks wired into the provider-specific SDK
    const handleChunk = (text: string) => {
      fullResponse += text;
      onChunk(text, false);
    };

    const handleUsage = (usage: { input_tokens: number; output_tokens: number; total_cost_usd: number; model: string }) => {
      db.recordUsage(
        agent.id,
        conversation.id,
        usage.input_tokens,
        usage.output_tokens,
        usage.total_cost_usd,
        usage.model,
      );

      broadcast({
        type: 'token_usage',
        agent_id: agent.id,
        conversation_id: conversation.id,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cost_usd: usage.total_cost_usd,
      });

      db.createActivity(
        agent.id,
        'tokens_used',
        `${usage.input_tokens} in / ${usage.output_tokens} out — $${usage.total_cost_usd.toFixed(4)}`,
      );
    };

    try {
      db.createActivity(agent.id, 'message_processing', `Sending to ${agent.model}`);

      switch (agent.provider) {
        case 'openai': {
          const { openaiChat } = await import('../agent/openai-sdk');
          await openaiChat({
            prompt: content,
            systemPrompt: agent.system_prompt || undefined,
            model: agent.model,
            temperature: agent.config.temperature,
            maxTokens: agent.permissions.max_tokens_per_message,
            onChunk: handleChunk,
            onUsage: handleUsage,
          });
          break;
        }

        case 'gemini': {
          const { geminiChat } = await import('../agent/gemini-sdk');
          await geminiChat({
            prompt: content,
            systemPrompt: agent.system_prompt || undefined,
            model: agent.model,
            temperature: agent.config.temperature,
            maxTokens: agent.permissions.max_tokens_per_message,
            onChunk: handleChunk,
            onUsage: handleUsage,
          });
          break;
        }

        case 'claude':
        default: {
          const { anthropicChat } = await import('../agent/anthropic-sdk');
          await anthropicChat({
            prompt: content,
            systemPrompt: agent.system_prompt || undefined,
            model: agent.model,
            temperature: agent.config.temperature,
            maxTokens: agent.permissions.max_tokens_per_message,
            onChunk: handleChunk,
            onUsage: handleUsage,
          });
          break;
        }
      }

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
    // External agent: close the WebSocket connection
    const agent = db.getAgent(agentId);
    if (agent?.connection_type === 'external') {
      disconnectAgent(agentId);
      // Status update happens in the agent-handler disconnect handler
      return;
    }

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
    const containerName = `handler-agent-${agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
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
        'handler-agent:latest',
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
    for (const key of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_API_KEY', 'GEMINI_API_KEY']) {
      if (process.env[key]) secrets[key] = process.env[key]!;
    }
    return secrets;
  }
}
