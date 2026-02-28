import { useState } from 'react';
import { PROVIDER_MODELS, type AgentProvider } from '@handler/shared';
import { useAgentStore } from '../../stores/agentStore';

interface Props {
  onClose: () => void;
  editAgent?: {
    id: string;
    name: string;
    description: string;
    provider?: AgentProvider;
    model: string;
    system_prompt: string;
    connection_type?: 'builtin' | 'external';
    permissions: Record<string, unknown>;
  };
}

export function AgentConfig({ onClose, editAgent }: Props) {
  const createAgent = useAgentStore((s) => s.createAgent);
  const updateAgent = useAgentStore((s) => s.editAgent);
  const deleteAgent = useAgentStore((s) => s.deleteAgent);

  const [name, setName] = useState(editAgent?.name || '');
  const [description, setDescription] = useState(editAgent?.description || '');
  const [provider, setProvider] = useState<Exclude<AgentProvider, 'external'>>(
    (editAgent?.provider as Exclude<AgentProvider, 'external'>) || 'claude'
  );
  const [model, setModel] = useState(editAgent?.model || PROVIDER_MODELS.claude[0].id);
  const [systemPrompt, setSystemPrompt] = useState(editAgent?.system_prompt || '');
  const [maxCost, setMaxCost] = useState(String(editAgent?.permissions?.max_cost_usd ?? 1));
  const [requiresApproval, setRequiresApproval] = useState(!!editAgent?.permissions?.requires_approval);
  const [isExternal, setIsExternal] = useState(editAgent?.connection_type === 'external');
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  const isEdit = !!editAgent;
  const isExternalEdit = isEdit && editAgent?.connection_type === 'external';

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await updateAgent(editAgent.id, {
          name: name.trim(),
          description: description.trim(),
          ...(!isExternalEdit && {
            model,
            system_prompt: systemPrompt.trim(),
          }),
          permissions: {
            max_cost_usd: parseFloat(maxCost) || 1,
            requires_approval: requiresApproval,
          },
        });
        onClose();
      } else {
        if (isExternal) {
          const result = await createAgent({
            name: name.trim(),
            description: description.trim(),
            connection_type: 'external',
            provider: 'external',
            model: '',
          });
          if (result.auth_token) {
            setCreatedToken(result.auth_token);
          } else {
            onClose();
          }
        } else {
          await createAgent({
            name: name.trim(),
            description: description.trim(),
            provider,
            model,
            system_prompt: systemPrompt.trim(),
          });
          onClose();
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editAgent) return;
    await deleteAgent(editAgent.id);
    onClose();
  };

  const handleCopyToken = () => {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  };

  // After creating an external agent, show the token
  if (createdToken) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>External Agent Created</h3>
          </div>

          <div className="modal-body">
            <p style={{ marginBottom: '12px' }}>
              Copy this token now — it won't be shown again.
            </p>

            <div className="form-group">
              <label>Connection Token</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={createdToken}
                  readOnly
                  style={{ fontFamily: 'monospace', fontSize: '12px' }}
                />
                <button className="btn btn-primary" onClick={handleCopyToken}>
                  {tokenCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Connection URL</label>
              <input
                type="text"
                value={`ws://${window.location.hostname}:3001/ws/agent`}
                readOnly
                style={{ fontFamily: 'monospace', fontSize: '12px' }}
              />
            </div>

            <div className="form-group">
              <label>Example Code</label>
              <pre style={{
                background: 'var(--bg-tertiary, #1a1a2e)',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '11px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
              }}>
{`import { HandlerAgent } from '@handler/agent-sdk';

const agent = new HandlerAgent({
  url: 'ws://${window.location.hostname}:3001/ws/agent',
  token: '${createdToken}',
  name: '${name.trim()}',
});

agent.on('message', async (msg, reply) => {
  reply.chunk('Hello from my agent!');
  reply.done();
});

agent.connect();`}
              </pre>
            </div>
          </div>

          <div className="modal-footer">
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? 'Edit Agent' : 'Create Agent'}</h3>
          <button className="btn btn-sm" onClick={onClose}>X</button>
        </div>

        <div className="modal-body">
          {!isEdit && (
            <div className="form-group form-row">
              <label>External Agent</label>
              <input
                type="checkbox"
                checked={isExternal}
                onChange={(e) => setIsExternal(e.target.checked)}
              />
            </div>
          )}

          {isExternal && !isEdit && (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Connect an agent that's already running on your machine. It manages its own LLM, tools, and memory.
            </p>
          )}

          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isExternal ? 'NanoClaw' : 'My Agent'}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={isExternal ? 'My main agent with full context' : 'What does this agent do?'}
            />
          </div>

          {!isExternal && !isExternalEdit && (
            <>
              {!isEdit && (
                <div className="form-group">
                  <label>Provider</label>
                  <select
                    value={provider}
                    onChange={(e) => {
                      const p = e.target.value as Exclude<AgentProvider, 'external'>;
                      setProvider(p);
                      setModel(PROVIDER_MODELS[p][0].id);
                    }}
                  >
                    <option value="claude">Claude</option>
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </div>
              )}

              {isEdit && (
                <div className="form-group">
                  <label>Provider</label>
                  <input
                    type="text"
                    value={provider.charAt(0).toUpperCase() + provider.slice(1)}
                    readOnly
                    style={{ opacity: 0.7, cursor: 'not-allowed' }}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Model</label>
                <select value={model} onChange={(e) => setModel(e.target.value)}>
                  {PROVIDER_MODELS[provider].map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
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
            </>
          )}
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
            {saving ? 'Saving...' : isEdit ? 'Save' : isExternal ? 'Create & Get Token' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
