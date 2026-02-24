import { useEffect, useState, useRef } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { AgentList } from '../agents/AgentList';
import { AgentConfig } from '../agents/AgentConfig';

export function Sidebar() {
  const [showConfig, setShowConfig] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ id: string; y: number } | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { agents, selectedAgentId, fetchAgents, selectAgent } = useAgentStore();
  const {
    fetchConversations, conversations, selectConversation,
    createConversation, deleteConversation, searchMessages,
    searchResults, clearSearch,
  } = useChatStore();
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
    clearSearch();
    setSearchQuery('');
  };

  const handleSelectConversation = (id: string) => {
    selectConversation(id);
    clearSearch();
    setSearchQuery('');
    closeSidebar();
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    clearTimeout(searchTimeout.current);
    if (!selectedAgentId) return;
    searchTimeout.current = setTimeout(() => {
      searchMessages(selectedAgentId, query);
    }, 300);
  };

  const handleEditAgent = () => {
    const agent = agents.find((a) => a.id === selectedAgentId);
    if (agent) {
      setEditingAgent(agent);
      setShowConfig(true);
    }
  };

  const handleLongPress = (convId: string, e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setContextMenu({ id: convId, y: rect.top });
  };

  const handleDeleteConversation = (id: string) => {
    setContextMenu(null);
    deleteConversation(id);
  };

  return (
    <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h1 className="logo">Vault</h1>
        <button className="btn btn-sm" onClick={() => { setEditingAgent(null); setShowConfig(true); }}>
          + Agent
        </button>
      </div>

      <AgentList
        agents={agents}
        selectedId={selectedAgentId}
        onSelect={handleSelectAgent}
      />

      {selectedAgentId && (
        <>
          <div className="sidebar-section-header">
            <span>Conversations</span>
            <div className="sidebar-section-actions">
              <button className="btn btn-sm btn-icon" onClick={handleEditAgent} title="Edit agent">
                &#9881;
              </button>
              <button className="btn btn-sm" onClick={handleNewConversation}>
                +
              </button>
            </div>
          </div>

          <div className="search-bar">
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => { setSearchQuery(''); clearSearch(); }}>
                &times;
              </button>
            )}
          </div>

          {searchQuery && searchResults.length > 0 ? (
            <div className="search-results">
              {searchResults.map((r) => (
                <div
                  key={r.id}
                  className="search-result-item"
                  onClick={() => handleSelectConversation(r.conversation_id)}
                >
                  <div className="search-result-title">{r.conversation_title}</div>
                  <div className="search-result-preview">
                    {r.content.substring(0, 100)}...
                  </div>
                </div>
              ))}
            </div>
          ) : searchQuery && searchResults.length === 0 ? (
            <p className="muted" style={{ padding: '12px', textAlign: 'center', fontSize: '13px' }}>
              No results
            </p>
          ) : (
            <div className="conversation-list">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`conversation-item ${
                    useChatStore.getState().selectedConversationId === conv.id ? 'active' : ''
                  }`}
                  onClick={() => handleSelectConversation(conv.id)}
                  onContextMenu={(e) => handleLongPress(conv.id, e)}
                >
                  <span className="conversation-title">{conv.title}</span>
                  <button
                    className="conversation-delete"
                    onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y }}>
          <button onClick={() => handleDeleteConversation(contextMenu.id)}>Delete</button>
          <button onClick={() => setContextMenu(null)}>Cancel</button>
        </div>
      )}

      {showConfig && (
        <AgentConfig
          onClose={() => { setShowConfig(false); setEditingAgent(null); }}
          editAgent={editingAgent}
        />
      )}
    </div>
  );
}
