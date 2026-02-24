import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { AgentEvent, ServerAgentEvent } from '@vault/shared';
import * as db from '../db';
import { broadcast } from './handler';
import { logger } from '../logger';

// Connected external agents: agentId → WebSocket
const connectedAgents = new Map<string, WebSocket>();

// Reverse lookup: WebSocket → agentId (for disconnect cleanup)
const wsToAgentId = new Map<WebSocket, string>();

// Heartbeat interval (30s)
const HEARTBEAT_INTERVAL = 30_000;
// Timeout for unresponsive agents (60s)
const AGENT_TIMEOUT = 60_000;

let agentWss: WebSocketServer;

export function initAgentWebSocket(server: Server) {
  agentWss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests — route /ws/agent to this WSS
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    if (url.pathname === '/ws/agent') {
      agentWss.handleUpgrade(req, socket, head, (ws) => {
        agentWss.emit('connection', ws, req);
      });
    }
    // Note: /ws is handled by the main WSS in handler.ts (it uses { server, path: '/ws' })
  });

  agentWss.on('connection', (ws) => {
    logger.info('Agent WebSocket connection opened (awaiting hello)');

    let authenticated = false;
    let agentId: string | null = null;

    // Timeout: if no hello within 10s, close
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        ws.close(4001, 'Authentication timeout');
      }
    }, 10_000);

    // Heartbeat
    let alive = true;
    const heartbeat = setInterval(() => {
      if (!alive) {
        logger.warn('Agent %s unresponsive, closing', agentId);
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, HEARTBEAT_INTERVAL);

    ws.on('pong', () => {
      alive = true;
    });

    ws.on('message', async (raw) => {
      try {
        const event: AgentEvent = JSON.parse(raw.toString());
        await handleAgentEvent(ws, event, authenticated, agentId, (id) => {
          authenticated = true;
          agentId = id;
          clearTimeout(authTimeout);
        });
      } catch (err: any) {
        logger.error('Agent WS message error: %s', err.message);
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      clearInterval(heartbeat);
      const id = wsToAgentId.get(ws);
      if (id) {
        connectedAgents.delete(id);
        wsToAgentId.delete(ws);
        // Mark agent as stopped
        db.updateAgentStatus(id, 'stopped', null);
        broadcast({ type: 'agent_status', agent_id: id, status: 'stopped' });
        db.createActivity(id, 'agent_disconnected', 'External agent disconnected');
        logger.info('External agent %s disconnected', id);
      }
    });

    ws.on('error', (err) => {
      logger.error('Agent WS error: %s', err.message);
    });
  });

  logger.info('Agent WebSocket server ready on /ws/agent');
}

async function handleAgentEvent(
  ws: WebSocket,
  event: AgentEvent,
  authenticated: boolean,
  currentAgentId: string | null,
  onAuthenticated: (agentId: string) => void,
) {
  switch (event.type) {
    case 'agent.hello': {
      if (authenticated) return; // Already authenticated

      const { token, name, description } = event;

      // Look up agent by token
      let agent = db.getAgentByToken(token);

      if (!agent) {
        // Auto-register: create a new external agent with this token
        agent = db.createExternalAgent(name, description || '', token);
        logger.info('Auto-registered external agent: %s (%s)', name, agent.id);
      }

      if (agent.connection_type !== 'external') {
        ws.close(4003, 'Token belongs to a builtin agent');
        return;
      }

      // Disconnect existing connection for this agent if any
      const existing = connectedAgents.get(agent.id);
      if (existing) {
        existing.close(4004, 'Replaced by new connection');
      }

      // Register
      connectedAgents.set(agent.id, ws);
      wsToAgentId.set(ws, agent.id);
      onAuthenticated(agent.id);

      // Mark as running
      db.updateAgentStatus(agent.id, 'running', null);
      broadcast({ type: 'agent_status', agent_id: agent.id, status: 'running' });
      db.createActivity(agent.id, 'agent_connected', 'External agent connected');

      // Send welcome
      sendToAgentWs(ws, {
        type: 'server.welcome',
        agent_id: agent.id,
        name: agent.name,
      });

      logger.info('External agent authenticated: %s (%s)', agent.name, agent.id);
      break;
    }

    case 'agent.response.chunk': {
      if (!authenticated || !currentAgentId) return;

      const { request_id, content, done } = event;

      // Broadcast as message_chunk to browser clients
      // request_id is the messageId (assistant placeholder)
      // We need the conversation_id — look it up from the message
      const msgRow = db.getMessageById(request_id);
      if (!msgRow) {
        logger.warn('agent.response.chunk for unknown message: %s', request_id);
        return;
      }

      // Append content to the stored message
      if (content) {
        db.appendMessageContent(request_id, content);
      }

      broadcast({
        type: 'message_chunk',
        conversation_id: msgRow.conversation_id,
        message_id: request_id,
        role: 'assistant',
        content,
        content_type: 'markdown',
        done,
      });

      if (done) {
        db.createActivity(currentAgentId, 'response_complete', 'External agent response');
      }
      break;
    }

    case 'agent.error': {
      if (!authenticated || !currentAgentId) return;

      const { request_id, message } = event;
      const msgRow = db.getMessageById(request_id);

      if (msgRow) {
        db.updateMessageContent(request_id, `Error: ${message}`);
        broadcast({
          type: 'message_chunk',
          conversation_id: msgRow.conversation_id,
          message_id: request_id,
          role: 'assistant',
          content: `Error: ${message}`,
          content_type: 'text',
          done: true,
        });
      }

      broadcast({
        type: 'error',
        message,
        agent_id: currentAgentId,
      });

      db.createActivity(currentAgentId, 'error', message, 'failed');
      break;
    }
  }
}

function sendToAgentWs(ws: WebSocket, event: ServerAgentEvent) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

/**
 * Send a message to a connected external agent.
 * Returns true if the agent is connected and message was sent.
 */
export function sendToAgent(agentId: string, event: ServerAgentEvent): boolean {
  const ws = connectedAgents.get(agentId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  ws.send(JSON.stringify(event));
  return true;
}

/**
 * Check if an external agent is currently connected.
 */
export function isAgentConnected(agentId: string): boolean {
  const ws = connectedAgents.get(agentId);
  return !!ws && ws.readyState === WebSocket.OPEN;
}

/**
 * Disconnect an external agent.
 */
export function disconnectAgent(agentId: string): void {
  const ws = connectedAgents.get(agentId);
  if (ws) {
    ws.close(1000, 'Disconnected by server');
  }
}
