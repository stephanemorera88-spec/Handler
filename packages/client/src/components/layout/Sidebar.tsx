import { useEffect, useState } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { useChatStore } from '../../stores/chatStore';
import { AgentList } from '../agents/AgentList';
import { AgentConfig } from '../agents/AgentConfig';

export function Sidebar() {
  const [showConfig, setShowConfig] = useState(false);
  const { agents, selectedAgentId, fetchAgents, selectAgent } = useAgentStore();
  const { fetchConversations, conversations, selectConversation, createConversation } = useChatStore();

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    if (selectedAgentId) {
      fetchConversations(selectedAgentId);
    }
  }, [selectedAgentId, fetchConversations]);

  const handleNewConversation = async () => {
    if (!selectedAgentId) return;
    const conv = await createConversation(selectedAgentId);
    selectConversation(conv.id);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="logo">
          <span className="logo-icon">&#x1f512;</span> Vault
        </h1>
        <button className="btn btn-sm" onClick={() => setShowConfig(true)}>
          + Agent
        </button>
      </div>

      <AgentList
        agents={agents}
        selectedId={selectedAgentId}
        onSelect={(id) => {
          selectAgent(id);
          selectConversation(null);
        }}
      />

      {selectedAgentId && (
        <div className="conversation-list">
          <div className="conversation-list-header">
            <span>Conversations</span>
            <button className="btn btn-sm" onClick={handleNewConversation}>
              +
            </button>
          </div>
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conversation-item ${
                useChatStore.getState().selectedConversationId === conv.id ? 'active' : ''
              }`}
              onClick={() => selectConversation(conv.id)}
            >
              {conv.title}
            </div>
          ))}
        </div>
      )}

      {showConfig && (
        <AgentConfig onClose={() => setShowConfig(false)} />
      )}
    </div>
  );
}
