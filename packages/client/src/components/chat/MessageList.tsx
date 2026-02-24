import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';

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

export function MessageList({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      <div ref={bottomRef} />
    </div>
  );
}
