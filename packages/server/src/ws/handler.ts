import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { ClientEvent, ServerEvent } from '@vault/shared';
import * as db from '../db';
import { getRuntime } from '../agent/runtime';
import { logger } from '../logger';

const clients = new Set<WebSocket>();

let wss: WebSocketServer;

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: '/ws' });

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

      // Store user message
      const userMsg = db.createMessage(conversation.id, 'user', event.content);

      // Get the agent
      const agent = db.getAgent(conversation.agent_id);
      if (!agent) {
        return sendTo(ws, { type: 'error', message: 'Agent not found' });
      }

      // Create placeholder for assistant response
      const assistantMsg = db.createMessage(conversation.id, 'assistant', '', 'markdown');

      // Send the message to the agent runtime
      const runtime = getRuntime();
      try {
        await runtime.sendMessage(agent, conversation, event.content, (chunk, done) => {
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
        broadcast({
          type: 'error',
          message: err.message,
          agent_id: agent.id,
          conversation_id: conversation.id,
        });
      }
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
