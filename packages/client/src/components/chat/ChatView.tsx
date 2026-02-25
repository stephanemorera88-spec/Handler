import { useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAgentStore } from '../../stores/agentStore';
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';

interface Props {
  sendMessage: (conversationId: string, content: string) => void;
}

export function ChatView({ sendMessage }: Props) {
  const { selectedConversationId, messages, fetchMessages, streaming, loading, createConversation, selectConversation } = useChatStore();
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const agent = useAgentStore((s) => s.agents.find((a) => a.id === s.selectedAgentId));

  useEffect(() => {
    if (selectedConversationId) {
      fetchMessages(selectedConversationId);
    }
  }, [selectedConversationId, fetchMessages]);

  const handleSend = async (content: string) => {
    let convId = selectedConversationId;

    // Auto-create conversation if none selected
    if (!convId && selectedAgentId) {
      const conv = await createConversation(selectedAgentId, content.substring(0, 50));
      selectConversation(conv.id);
      convId = conv.id;
    }

    if (convId) {
      sendMessage(convId, content);
    }
  };

  if (!selectedAgentId) {
    return (
      <div className="chat-empty">
        <div className="chat-empty-content">
          <div className="chat-empty-icon">V</div>
          <h2>Welcome to Handler</h2>
          <p>Select an agent from the sidebar or create a new one to get started.</p>
        </div>
      </div>
    );
  }

  const isRunning = agent?.status === 'running';
  const isExternal = agent?.connection_type === 'external';

  const getPlaceholder = () => {
    if (!isRunning) {
      if (isExternal) {
        return `${agent?.name || 'Agent'} is offline — start the external process to connect`;
      }
      return `Start ${agent?.name || 'agent'} to send messages`;
    }
    if (streaming) return 'Waiting for response...';
    return 'Type a message...';
  };

  return (
    <div className="chat-view">
      {loading ? (
        <div className="chat-loading">
          <div className="spinner" />
        </div>
      ) : (
        <MessageList messages={messages} />
      )}
      <InputBar
        onSend={handleSend}
        disabled={streaming || !isRunning}
        placeholder={getPlaceholder()}
      />
    </div>
  );
}
