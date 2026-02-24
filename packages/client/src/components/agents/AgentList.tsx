import { AgentCard } from './AgentCard';

interface Agent {
  id: string;
  name: string;
  description: string;
  status: string;
  model: string;
}

interface Props {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function AgentList({ agents, selectedId, onSelect }: Props) {
  if (agents.length === 0) {
    return (
      <div className="agent-list-empty">
        <p>No agents yet</p>
        <p className="muted">Create your first agent to get started</p>
      </div>
    );
  }

  return (
    <div className="agent-list">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          selected={agent.id === selectedId}
          onClick={() => onSelect(agent.id)}
        />
      ))}
    </div>
  );
}
