import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { ClientEvent, ServerEvent } from '@vault/shared';
import * as db from '../db';
import { getRuntime } from '../agent/runtime';
import { logger } from '../logger';
import { verifyWsToken } from '../auth';

const clients = new Set<WebSocket>();

// Per-agent message queue: ensures messages are processed sequentially per agent
const agentQueues = new Map<string, Promise<void>>();

function enqueueForAgent(agentId: string, fn: () => Promise<void>): Promise<void> {
  const prev = agentQueues.get(agentId) || Promise.resolve();
  const next = prev.then(fn, fn); // Run even if previous failed
  agentQueues.set(agentId, next);
  // Clean up entry when queue drains
  next.then(() => {
    if (agentQueues.get(agentId) === next) {
      agentQueues.delete(agentId);
    }
  });
  return next;
}

let wss: WebSocketServer;

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ noServer: true });

  // Handle upgrade manually so /ws/agent doesn't get rejected
  // This listener runs first; agent-handler.ts adds a second listener for /ws/agent
  // Unknown paths are destroyed here to prevent socket/fd leaks
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    if (url.pathname === '/ws') {
      // Verify JWT token for browser clients
      if (!verifyWsToken(req.url || '')) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else if (url.pathname !== '/ws/agent') {
      // Unknown path — destroy the socket to prevent file descriptor leaks
      socket.destroy();
    }
    // /ws/agent is handled by agent-handler.ts
  });

  wss.on('connection', (ws) => {
    clients.add(ws);
    logger.info('WebSocket client connected (%d total)', clients.size);

    ws.on('message', async (raw) => {
      try {
        const event: ClientEvent = JSON.parse(raw.toString());
        await handleClientEvent(ws, event);
      } catch (err: any) {
        logger.error('WS message error: %s', err.message);
        sendTo(ws, { type: 'error', message: 'Invalid message format' });
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      logger.info('WebSocket client disconnected (%d total)', clients.size);
    });
  });
}

async function handleClientEvent(ws: WebSocket, event: ClientEvent) {
  switch (event.type) {
    case 'send_message': {
      const conversation = db.getConversation(event.conversation_id);
      if (!conversation) {
        return sendTo(ws, { type: 'error', message: 'Conversation not found', conversation_id: event.conversation_id });
      }

      // Get the agent
      const agent = db.getAgent(conversation.agent_id);
      if (!agent) {
        return sendTo(ws, { type: 'error', message: 'Agent not found' });
      }

      // Enqueue so concurrent messages to the same agent are processed sequentially
      enqueueForAgent(agent.id, async () => {
        // Store user message
        db.createMessage(conversation.id, 'user', event.content);

        // Create placeholder for assistant response
        const assistantMsg = db.createMessage(conversation.id, 'assistant', '', 'markdown');

        // Send the message to the agent runtime
        const runtime = getRuntime();
        try {
          await runtime.sendMessage(agent, conversation, event.content, assistantMsg.id, (chunk, done) => {
            broadcast({
              type: 'message_chunk',
              conversation_id: conversation.id,
              message_id: assistantMsg.id,
              role: 'assistant',
              content: chunk,
              content_type: 'markdown',
              done,
            });
          });
        } catch (err: any) {
          logger.error('Agent message error: %s', err.message);
          // Clean up the empty assistant placeholder so users don't see a blank bubble
          const msg = db.getMessageById(assistantMsg.id);
          if (msg && !msg.content) {
            db.deleteMessage(assistantMsg.id);
          }
          broadcast({
            type: 'error',
            message: err.message,
            agent_id: agent.id,
            conversation_id: conversation.id,
          });
        }
      });
      break;
    }

    case 'start_agent': {
      const agent = db.getAgent(event.agent_id);
      if (!agent) return sendTo(ws, { type: 'error', message: 'Agent not found', agent_id: event.agent_id });

      try {
        const runtime = getRuntime();
        await runtime.startAgent(agent);
        broadcast({ type: 'agent_status', agent_id: agent.id, status: 'running' });
      } catch (err: any) {
        broadcast({ type: 'error', message: err.message, agent_id: agent.id });
      }
      break;
    }

    case 'stop_agent': {
      try {
        const runtime = getRuntime();
        if (event.force) {
          await runtime.killAgent(event.agent_id);
        } else {
          await runtime.stopAgent(event.agent_id);
        }
        broadcast({ type: 'agent_status', agent_id: event.agent_id, status: 'stopped' });
      } catch (err: any) {
        broadcast({ type: 'error', message: err.message, agent_id: event.agent_id });
      }
      break;
    }
  }
}

function sendTo(ws: WebSocket, event: ServerEvent) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

export function broadcast(event: ServerEvent) {
  const data = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}
