import { StatusBadge } from '../controls/StatusBadge';

interface Props {
  agent: {
    id: string;
    name: string;
    description: string;
    status: string;
    model: string;
  };
  selected: boolean;
  onClick: () => void;
}

export function AgentCard({ agent, selected, onClick }: Props) {
  return (
    <div
      className={`agent-card ${selected ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="agent-card-header">
        <span className="agent-card-name">{agent.name}</span>
        <StatusBadge status={agent.status} />
      </div>
      {agent.description && (
        <p className="agent-card-desc">{agent.description}</p>
      )}
    </div>
  );
}
