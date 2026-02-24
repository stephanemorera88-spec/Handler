import { useEffect, useState } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { useActivityStore } from '../../stores/activityStore';

export function ActivityPanel() {
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const { activities, fetchActivity, usageSummaries, fetchUsage } = useActivityStore();
  const [open, setOpen] = useState(false);

  const usage = selectedAgentId ? usageSummaries[selectedAgentId] : null;

  useEffect(() => {
    if (!selectedAgentId || !open) return;
    fetchActivity(selectedAgentId);
    fetchUsage(selectedAgentId);
  }, [selectedAgentId, open, fetchActivity, fetchUsage]);

  if (!selectedAgentId) return null;

  return (
    <>
      <button className="activity-toggle" onClick={() => setOpen(!open)}>
        {usage && usage.total_cost_usd > 0
          ? `$${usage.total_cost_usd.toFixed(4)}`
          : 'Activity'}
      </button>

      {open && (
        <div className="activity-panel">
          <div className="activity-panel-header">
            <h3>Activity</h3>
            <button className="btn btn-sm" onClick={() => setOpen(false)}>X</button>
          </div>

          {usage && usage.total_cost_usd > 0 && (
            <div className="usage-summary">
              <div className="usage-row">
                <span>Total Cost</span>
                <span className="usage-value">${usage.total_cost_usd.toFixed(4)}</span>
              </div>
              <div className="usage-row">
                <span>Input Tokens</span>
                <span className="usage-value">{usage.total_input_tokens.toLocaleString()}</span>
              </div>
              <div className="usage-row">
                <span>Output Tokens</span>
                <span className="usage-value">{usage.total_output_tokens.toLocaleString()}</span>
              </div>
              <div className="usage-row">
                <span>Messages</span>
                <span className="usage-value">{usage.message_count}</span>
              </div>
            </div>
          )}

          <div className="activity-list">
            {activities.length === 0 ? (
              <p className="muted" style={{ padding: '16px', textAlign: 'center' }}>
                No activity yet
              </p>
            ) : (
              activities.map((entry) => (
                <div key={entry.id} className={`activity-entry ${entry.status}`}>
                  <div className="activity-action">{formatAction(entry.action)}</div>
                  <div className="activity-detail">{entry.detail}</div>
                  <div className="activity-time">
                    {new Date(entry.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
