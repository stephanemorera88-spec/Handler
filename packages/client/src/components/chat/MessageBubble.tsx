import { MarkdownRenderer } from '../output/MarkdownRenderer';

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
  message: Message;
  isGroup?: boolean;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}

/** Deterministic hue from a string (agent_id) */
function agentHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function MessageBubble({ message, isGroup }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const showAgentName = isGroup && !isUser && !isSystem && message.agent_name;

  // Color-coded avatar for group chats
  const avatarStyle = isGroup && message.agent_id && !isUser && !isSystem
    ? { background: `hsl(${agentHue(message.agent_id)}, 60%, 45%)`, color: 'white' }
    : undefined;

  // Avatar text: first 2 chars of agent name in group, or default
  const avatarText = isUser
    ? 'You'
    : isSystem
      ? 'Sys'
      : isGroup && message.agent_name
        ? message.agent_name.substring(0, 2).toUpperCase()
        : 'AI';

  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="message-avatar" style={avatarStyle}>
        {avatarText}
      </div>
      <div className="message-content">
        {showAgentName && (
          <span
            className="message-agent-name"
            style={{ color: `hsl(${agentHue(message.agent_id!)}, 70%, 65%)` }}
          >
            {message.agent_name}
          </span>
        )}
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
