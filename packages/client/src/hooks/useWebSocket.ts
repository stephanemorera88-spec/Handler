import { useEffect, useRef, useCallback } from 'react';
import { useAgentStore } from '../stores/agentStore';
import { useChatStore } from '../stores/chatStore';

type ServerEvent = {
  type: string;
  [key: string]: unknown;
};

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const updateAgent = useAgentStore((s) => s.updateAgent);
  const { appendToMessage, updateMessage, addMessage, setStreaming } = useChatStore.getState();

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[vault] WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data: ServerEvent = JSON.parse(event.data);
        handleEvent(data);
      } catch {
        console.error('[vault] Failed to parse WS message');
      }
    };

    ws.onclose = () => {
      console.log('[vault] WebSocket disconnected, reconnecting...');
      reconnectTimeout.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  const handleEvent = useCallback((event: ServerEvent) => {
    const store = useChatStore.getState();

    switch (event.type) {
      case 'message_chunk': {
        const { message_id, content, done, conversation_id } = event as any;
        if (content) {
          // Check if this message exists already
          const existing = store.messages.find((m) => m.id === message_id);
          if (existing) {
            useChatStore.getState().appendToMessage(message_id, content);
          } else {
            useChatStore.getState().addMessage({
              id: message_id,
              conversation_id,
              role: 'assistant',
              content,
              content_type: 'markdown',
              metadata: {},
              created_at: new Date().toISOString(),
              streaming: true,
            });
          }
        }
        if (done) {
          useChatStore.getState().updateMessage(message_id, { streaming: false });
          useChatStore.getState().setStreaming(false);
        }
        break;
      }

      case 'agent_status': {
        const { agent_id, status, container_id } = event as any;
        updateAgent(agent_id, { status, container_id });
        break;
      }

      case 'error': {
        console.error('[vault] Server error:', (event as any).message);
        useChatStore.getState().setStreaming(false);
        break;
      }
    }
  }, [updateAgent]);

  const send = useCallback((event: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  const sendMessage = useCallback((conversationId: string, content: string) => {
    // Add optimistic user message
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
    connect();
    return () => {
      clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { send, sendMessage };
}
