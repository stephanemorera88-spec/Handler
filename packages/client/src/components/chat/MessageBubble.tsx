import { MarkdownRenderer } from '../output/MarkdownRenderer';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  content_type: string;
  created_at: string;
  streaming?: boolean;
}

interface Props {
  message: Message;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="message-avatar">
        {isUser ? 'You' : isSystem ? 'Sys' : 'AI'}
      </div>
      <div className="message-content">
        {message.content_type === 'markdown' || message.role === 'assistant' ? (
          <MarkdownRenderer content={message.content} />
        ) : (
          <p>{message.content}</p>
        )}
        {message.streaming && (
          <span className="typing-indicator">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </span>
        )}
        {!message.streaming && message.created_at && (
          <span className="message-time">{formatTime(message.created_at)}</span>
        )}
      </div>
    </div>
  );
}
