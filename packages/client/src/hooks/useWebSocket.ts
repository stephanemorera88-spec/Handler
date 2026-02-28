import { useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAgentStore } from '../stores/agentStore';
import { useChatStore } from '../stores/chatStore';
import { useActivityStore } from '../stores/activityStore';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';

type ServerEvent = {
  type: string;
  [key: string]: unknown;
};

// Singleton WebSocket — shared across React re-mounts (StrictMode safe)
let globalWs: WebSocket | null = null;
let globalReconnectTimeout: ReturnType<typeof setTimeout> | undefined;
let connectionCount = 0;

export function useWebSocket() {
  const updateAgent = useAgentStore((s) => s.updateAgent);
  const updateAgentRef = useRef(updateAgent);
  updateAgentRef.current = updateAgent;

  const handleEvent = useCallback((event: ServerEvent) => {
    switch (event.type) {
      case 'message_chunk': {
        const { message_id, content, done, conversation_id, agent_id, agent_name } = event as any;
        const store = useChatStore.getState();

        // Only render chunks for the currently selected conversation
        if (store.selectedConversationId !== conversation_id) break;

        if (content) {
          const existing = store.messages.find((m) => m.id === message_id);
          if (existing) {
            store.appendToMessage(message_id, content);
          } else {
            store.addMessage({
              id: message_id,
              conversation_id,
              role: 'assistant',
              content,
              content_type: 'markdown',
              metadata: {},
              created_at: new Date().toISOString(),
              streaming: true,
              agent_id,
              agent_name,
            });
          }
        }

        // Track per-agent streaming for group chats
        if (agent_id && !done) {
          store.addStreamingAgent(agent_id);
        }

        if (done) {
          store.updateMessage(message_id, { streaming: false });
          if (agent_id) {
            store.removeStreamingAgent(agent_id);
          } else {
            store.setStreaming(false);
          }
        }
        break;
      }

      case 'agent_status': {
        const { agent_id, status, container_id } = event as any;
        updateAgentRef.current(agent_id, { status, container_id });

        // If an agent goes offline while we're streaming, reset streaming state
        // so the input bar doesn't stay permanently disabled
        if (status === 'stopped' || status === 'error') {
          const chatState = useChatStore.getState();
          if (chatState.streaming) {
            chatState.setStreaming(false);
          }
        }
        break;
      }

      case 'activity': {
        const { agent_id, action, detail } = event as any;
        useActivityStore.getState().addActivity({
          id: `ws-${Date.now()}`,
          agent_id,
          action,
          detail,
          status: 'completed',
          created_at: new Date().toISOString(),
        });
        break;
      }

      case 'token_usage': {
        const { agent_id, input_tokens, output_tokens, cost_usd } = event as any;
        useActivityStore.getState().updateUsage(agent_id, {
          total_input_tokens: input_tokens,
          total_output_tokens: output_tokens,
          total_cost_usd: cost_usd,
          message_count: 1,
        });
        break;
      }

      case 'approval_request': {
        const { approval_id, agent_id, action_type, action_detail } = event as any;
        useActivityStore.getState().addApproval({
          id: approval_id,
          agent_id,
          action_type,
          action_detail,
          status: 'pending',
          created_at: new Date().toISOString(),
        });
        toast('Approval required', { icon: '⚡' });
        break;
      }

      case 'error': {
        const msg = (event as any).message || 'Unknown error';
        console.error('[handler] Server error:', msg);
        useChatStore.getState().setStreaming(false);
        toast.error(msg);
        break;
      }
    }
  }, []);

  const connect = useCallback(() => {
    // Close existing connection if any
    if (globalWs) {
      globalWs.onclose = null; // Prevent reconnect loop
      globalWs.close();
      globalWs = null;
    }
    clearTimeout(globalReconnectTimeout);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = useAuthStore.getState().token;
    const wsUrl = `${protocol}//${window.location.host}/ws${token ? `?token=${token}` : ''}`;
    const ws = new WebSocket(wsUrl);
    globalWs = ws;

    ws.onopen = () => {
      console.log('[handler] WebSocket connected');
      useUIStore.getState().setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data: ServerEvent = JSON.parse(event.data);
        handleEvent(data);
      } catch {
        console.error('[handler] Failed to parse WS message');
      }
    };

    ws.onclose = () => {
      console.log('[handler] WebSocket disconnected, reconnecting...');
      globalWs = null;
      useUIStore.getState().setConnected(false);
      globalReconnectTimeout = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [handleEvent]);

  const send = useCallback((event: Record<string, unknown>) => {
    if (globalWs?.readyState === WebSocket.OPEN) {
      globalWs.send(JSON.stringify(event));
    }
  }, []);

  const sendMessage = useCallback((conversationId: string, content: string) => {
    if (globalWs?.readyState !== WebSocket.OPEN) {
      toast.error('Not connected — message not sent');
      return;
    }

    useChatStore.getState().addMessage({
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      role: 'user',
      content,
      content_type: 'text',
      metadata: {},
      created_at: new Date().toISOString(),
    });
    useChatStore.getState().setStreaming(true);

    send({
      type: 'send_message',
      conversation_id: conversationId,
      content,
    });
  }, [send]);

  useEffect(() => {
    connectionCount++;
    if (connectionCount === 1 || !globalWs) {
      connect();
    }

    return () => {
      connectionCount--;
      if (connectionCount === 0) {
        clearTimeout(globalReconnectTimeout);
        if (globalWs) {
          globalWs.onclose = null;
          globalWs.close();
          globalWs = null;
        }
      }
    };
  }, [connect]);

  return { send, sendMessage };
}
