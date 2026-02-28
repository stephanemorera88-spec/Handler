import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { useChatStore } from '../../stores/chatStore';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  content_type: string;
  created_at: string;
  streaming?: boolean;
  agent_id?: string;
  agent_name?: string;
}

interface Props {
  messages: Message[];
  isGroup?: boolean;
}

function TypingIndicator({ agentName }: { agentName?: string }) {
  return (
    <div className="message-bubble assistant">
      <div className="message-avatar">AI</div>
      <div className="message-content typing-bubble">
        {agentName && <span className="message-agent-name">{agentName}</span>}
        <span className="typing-indicator">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </span>
      </div>
    </div>
  );
}

export function MessageList({ messages, isGroup }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const streaming = useChatStore((s) => s.streaming);
  const streamingAgentIds = useChatStore((s) => s.streamingAgentIds);

  // Show typing indicator when streaming but no assistant message is streaming yet
  const hasStreamingMessage = messages.some((m) => m.streaming);
  const showTyping = streaming && !hasStreamingMessage;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showTyping, streamingAgentIds]);

  if (messages.length === 0) {
    return (
      <div className="message-list empty">
        <p className="muted">Send a message to start the conversation</p>
      </div>
    );
  }

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} isGroup={isGroup} />
      ))}
      {showTyping && !isGroup && <TypingIndicator />}
      {isGroup && streamingAgentIds.length > 0 && !hasStreamingMessage &&
        streamingAgentIds.map((id) => (
          <TypingIndicator key={`typing-${id}`} />
        ))
      }
      <div ref={bottomRef} />
    </div>
  );
}
