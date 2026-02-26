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
}

interface Props {
  messages: Message[];
}

function TypingIndicator() {
  return (
    <div className="message-bubble assistant">
      <div className="message-avatar">AI</div>
      <div className="message-content typing-bubble">
        <span className="typing-indicator">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </span>
      </div>
    </div>
  );
}

export function MessageList({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const streaming = useChatStore((s) => s.streaming);

  // Show typing indicator when streaming but no assistant message is streaming yet
  const hasStreamingMessage = messages.some((m) => m.streaming);
  const showTyping = streaming && !hasStreamingMessage;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showTyping]);

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
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {showTyping && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
