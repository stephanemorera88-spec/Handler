import { useEffect, useState } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { AgentList } from '../agents/AgentList';
import { AgentConfig } from '../agents/AgentConfig';

export function Sidebar() {
  const [showConfig, setShowConfig] = useState(false);
  const { agents, selectedAgentId, fetchAgents, selectAgent } = useAgentStore();
  const { fetchConversations, conversations, selectConversation, createConversation } = useChatStore();
  const { sidebarOpen, closeSidebar } = useUIStore();

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
    closeSidebar();
  };

  const handleSelectAgent = (id: string) => {
    selectAgent(id);
    selectConversation(null);
  };

  const handleSelectConversation = (id: string) => {
    selectConversation(id);
    closeSidebar();
  };

  return (
    <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h1 className="logo">Vault</h1>
        <button className="btn btn-sm" onClick={() => setShowConfig(true)}>
          + Agent
        </button>
      </div>

      <AgentList
        agents={agents}
        selectedId={selectedAgentId}
        onSelect={handleSelectAgent}
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
              onClick={() => handleSelectConversation(conv.id)}
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
