import { useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAgentStore } from '../../stores/agentStore';
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';

interface Props {
  sendMessage: (conversationId: string, content: string) => void;
}

export function ChatView({ sendMessage }: Props) {
  const { selectedConversationId, messages, fetchMessages, streaming, createConversation, selectConversation } = useChatStore();
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);

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
          <h2>Welcome to Vault</h2>
          <p>Select an agent from the sidebar or create a new one to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view">
      <MessageList messages={messages} />
      <InputBar onSend={handleSend} disabled={streaming} />
    </div>
  );
}
