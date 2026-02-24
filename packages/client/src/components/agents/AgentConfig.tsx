import { useState } from 'react';
import { useAgentStore } from '../../stores/agentStore';

interface Props {
  onClose: () => void;
}

export function AgentConfig({ onClose }: Props) {
  const createAgent = useAgentStore((s) => s.createAgent);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createAgent({
        name: name.trim(),
        description: description.trim(),
        provider: 'claude',
        model,
        system_prompt: systemPrompt.trim(),
      });
      onClose();
    } catch (err) {
      console.error('Failed to create agent:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Agent</h3>
          <button className="btn btn-sm" onClick={onClose}>X</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Agent"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
            />
          </div>

          <div className="form-group">
            <label>Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
              <option value="claude-opus-4-20250514">Claude Opus 4</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
            </select>
          </div>

          <div className="form-group">
            <label>System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant..."
              rows={4}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={!name.trim() || creating}
          >
            {creating ? 'Creating...' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
