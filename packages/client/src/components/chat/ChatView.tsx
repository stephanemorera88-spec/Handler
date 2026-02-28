import { useEffect, useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useAgentStore } from '../../stores/agentStore';
import { MessageList } from './MessageList';
import { InputBar } from './InputBar';

interface Props {
  sendMessage: (conversationId: string, content: string) => void;
}

export function ChatView({ sendMessage }: Props) {
  const { selectedConversationId, conversations, messages, fetchMessages, streaming, loading, createConversation, selectConversation } = useChatStore();
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const agents = useAgentStore((s) => s.agents);
  const agent = agents.find((a) => a.id === selectedAgentId);

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId);
  const isGroup = !!selectedConversation?.is_group;

  // For group chats, check if ANY agent in the group is running
  const isRunning = useMemo(() => {
    if (isGroup && selectedConversation?.agent_ids) {
      return selectedConversation.agent_ids.some((id) => {
        const a = agents.find((ag) => ag.id === id);
        return a?.status === 'running';
      });
    }
    return agent?.status === 'running';
  }, [isGroup, selectedConversation, agents, agent]);

  useEffect(() => {
    if (selectedConversationId) {
      fetchMessages(selectedConversationId);
    }
  }, [selectedConversationId, fetchMessages]);

  const handleSend = async (content: string) => {
    let convId = selectedConversationId;

    // Auto-create conversation if none selected (single agent only)
    if (!convId && selectedAgentId && !isGroup) {
      try {
        const conv = await createConversation(selectedAgentId, content.substring(0, 50));
        selectConversation(conv.id);
        convId = conv.id;
      } catch {
        return;
      }
    }

    if (convId) {
      sendMessage(convId, content);
    }
  };

  if (!selectedAgentId && !isGroup) {
    return (
      <div className="chat-empty">
        <div className="chat-empty-content">
          <div className="chat-empty-icon">H</div>
          <h2>Welcome to Handler</h2>
          <p>Select an agent from the sidebar or create a new one to get started.</p>
        </div>
      </div>
    );
  }

  const isExternal = agent?.connection_type === 'external';

  const getPlaceholder = () => {
    if (isGroup) {
      if (!isRunning) return 'Start at least one agent in the group to chat';
      if (streaming) return 'Agents are responding...';
      return 'Message the group...';
    }
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
        <MessageList messages={messages} isGroup={isGroup} />
      )}
      <InputBar
        onSend={handleSend}
        disabled={streaming || !isRunning}
        placeholder={getPlaceholder()}
      />
    </div>
  );
}
