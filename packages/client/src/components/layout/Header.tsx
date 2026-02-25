import { useEffect } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { useUIStore } from '../../stores/uiStore';
import { useActivityStore } from '../../stores/activityStore';
import { StatusBadge } from '../controls/StatusBadge';
import { KillSwitch } from '../controls/KillSwitch';

export function Header() {
  const { agents, selectedAgentId } = useAgentStore();
  const { toggleSidebar } = useUIStore();
  const { usageSummaries, fetchUsage } = useActivityStore();
  const agent = agents.find((a) => a.id === selectedAgentId);
  const usage = selectedAgentId ? usageSummaries[selectedAgentId] : null;

  useEffect(() => {
    if (selectedAgentId) {
      fetchUsage(selectedAgentId);
    }
  }, [selectedAgentId, fetchUsage]);

  if (!agent) {
    return (
      <div className="header">
        <div className="header-left">
          <button className="menu-btn" onClick={toggleSidebar}>&#9776;</button>
          <div className="header-title">Handler</div>
        </div>
      </div>
    );
  }

  return (
    <div className="header">
      <div className="header-left">
        <button className="menu-btn" onClick={toggleSidebar}>&#9776;</button>
        <h2 className="header-title">{agent.name}</h2>
        <StatusBadge status={agent.status} />
        <span className="header-model">{agent.model}</span>
      </div>
      <div className="header-right">
        {usage && usage.total_cost_usd > 0 && (
          <span className="header-cost">${usage.total_cost_usd.toFixed(4)}</span>
        )}
        <KillSwitch agentId={agent.id} status={agent.status} />
      </div>
    </div>
  );
}
