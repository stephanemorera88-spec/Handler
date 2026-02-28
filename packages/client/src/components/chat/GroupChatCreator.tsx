import { useState } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { useChatStore } from '../../stores/chatStore';

interface Props {
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

export function GroupChatCreator({ onClose, onCreated }: Props) {
  const agents = useAgentStore((s) => s.agents);
  const createGroupConversation = useChatStore((s) => s.createGroupConversation);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const toggleAgent = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (selected.size < 2) return;
    setCreating(true);
    try {
      const conv = await createGroupConversation(Array.from(selected), title || undefined);
      onCreated(conv.id);
    } catch {
      // Error already toasted in store
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal group-creator-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Group Chat</h3>
          <button className="btn btn-sm" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Group Name (optional)</label>
            <input
              type="text"
              placeholder="e.g. Research Team"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Select Agents (min 2)</label>
            <div className="group-agent-list">
              {agents.map((agent) => (
                <label key={agent.id} className="group-agent-item">
                  <input
                    type="checkbox"
                    checked={selected.has(agent.id)}
                    onChange={() => toggleAgent(agent.id)}
                  />
                  <div className="group-agent-info">
                    <span className="group-agent-name">{agent.name}</span>
                    {agent.description && (
                      <span className="group-agent-desc">{agent.description}</span>
                    )}
                  </div>
                  <span className={`status-dot-sm ${agent.status === 'running' ? 'running' : ''}`} />
                </label>
              ))}
              {agents.length === 0 && (
                <p className="muted" style={{ textAlign: 'center', padding: '12px' }}>
                  No agents created yet
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={selected.size < 2 || creating}
            onClick={handleCreate}
          >
            {creating ? 'Creating...' : `Create Group (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
