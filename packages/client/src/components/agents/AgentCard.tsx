import { StatusBadge } from '../controls/StatusBadge';

interface Props {
  agent: {
    id: string;
    name: string;
    description: string;
    status: string;
    model: string;
    connection_type?: 'builtin' | 'external';
  };
  selected: boolean;
  onClick: () => void;
}

export function AgentCard({ agent, selected, onClick }: Props) {
  const isExternal = agent.connection_type === 'external';

  return (
    <div
      className={`agent-card ${selected ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="agent-card-header">
        <span className="agent-card-name">
          {agent.name}
          {isExternal && (
            <span style={{
              fontSize: '10px',
              marginLeft: '6px',
              padding: '1px 5px',
              borderRadius: '3px',
              background: 'var(--bg-tertiary, #2a2a4a)',
              color: 'var(--text-secondary, #8888aa)',
              verticalAlign: 'middle',
            }}>
              ext
            </span>
          )}
        </span>
        <StatusBadge status={agent.status} />
      </div>
      {agent.description && (
        <p className="agent-card-desc">{agent.description}</p>
      )}
    </div>
  );
}
