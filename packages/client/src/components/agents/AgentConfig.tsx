import { useState } from 'react';
import { useAgentStore } from '../../stores/agentStore';

interface Props {
  onClose: () => void;
  editAgent?: {
    id: string;
    name: string;
    description: string;
    model: string;
    system_prompt: string;
    permissions: Record<string, unknown>;
  };
}

export function AgentConfig({ onClose, editAgent }: Props) {
  const createAgent = useAgentStore((s) => s.createAgent);
  const updateAgent = useAgentStore((s) => s.editAgent);
  const deleteAgent = useAgentStore((s) => s.deleteAgent);

  const [name, setName] = useState(editAgent?.name || '');
  const [description, setDescription] = useState(editAgent?.description || '');
  const [model, setModel] = useState(editAgent?.model || 'claude-sonnet-4-20250514');
  const [systemPrompt, setSystemPrompt] = useState(editAgent?.system_prompt || '');
  const [maxCost, setMaxCost] = useState(String(editAgent?.permissions?.max_cost_usd ?? 1));
  const [requiresApproval, setRequiresApproval] = useState(!!editAgent?.permissions?.requires_approval);
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const isEdit = !!editAgent;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await updateAgent(editAgent.id, {
          name: name.trim(),
          description: description.trim(),
          model,
          system_prompt: systemPrompt.trim(),
          permissions: {
            max_cost_usd: parseFloat(maxCost) || 1,
            requires_approval: requiresApproval,
          },
        });
      } else {
        await createAgent({
          name: name.trim(),
          description: description.trim(),
          provider: 'claude',
          model,
          system_prompt: systemPrompt.trim(),
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editAgent) return;
    await deleteAgent(editAgent.id);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'Edit Agent' : 'Create Agent'}</h3>
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

          <div className="form-group">
            <label>Max Cost (USD)</label>
            <input
              type="number"
              value={maxCost}
              onChange={(e) => setMaxCost(e.target.value)}
              min="0.01"
              step="0.5"
            />
          </div>

          <div className="form-group form-row">
            <label>Require approval before sending</label>
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
            />
          </div>
        </div>

        <div className="modal-footer">
          {isEdit && (
            showDelete ? (
              <button className="btn btn-danger" onClick={handleDelete}>
                Confirm Delete
              </button>
            ) : (
              <button className="btn btn-danger-outline" onClick={() => setShowDelete(true)}>
                Delete
              </button>
            )
          )}
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving ? 'Saving...' : isEdit ? 'Save' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
