import { useAgentStore } from '../../stores/agentStore';
import { StatusBadge } from '../controls/StatusBadge';
import { KillSwitch } from '../controls/KillSwitch';

export function Header() {
  const { agents, selectedAgentId } = useAgentStore();
  const agent = agents.find((a) => a.id === selectedAgentId);

  if (!agent) {
    return (
      <div className="header">
        <div className="header-title">Select an agent to start chatting</div>
      </div>
    );
  }

  return (
    <div className="header">
      <div className="header-left">
        <h2 className="header-title">{agent.name}</h2>
        <StatusBadge status={agent.status} />
        <span className="header-model">{agent.model}</span>
      </div>
      <div className="header-right">
        <KillSwitch agentId={agent.id} status={agent.status} />
      </div>
    </div>
  );
}
