import { useEffect, useState } from 'react';
import { useAgentStore } from '../../stores/agentStore';

interface ActivityEntry {
  id: string;
  action: string;
  detail: string;
  status: string;
  created_at: string;
}

export function ActivityPanel() {
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!selectedAgentId || !open) return;

    const fetchActivity = async () => {
      const res = await fetch(`/api/agents/${selectedAgentId}/activity`);
      const data = await res.json();
      setActivity(data);
    };

    fetchActivity();
    const interval = setInterval(fetchActivity, 5000);
    return () => clearInterval(interval);
  }, [selectedAgentId, open]);

  if (!selectedAgentId) return null;

  return (
    <>
      <button
        className="activity-toggle"
        onClick={() => setOpen(!open)}
      >
        Activity
      </button>

      {open && (
        <div className="activity-panel">
          <div className="activity-panel-header">
            <h3>Activity Log</h3>
            <button className="btn btn-sm" onClick={() => setOpen(false)}>X</button>
          </div>
          <div className="activity-list">
            {activity.length === 0 ? (
              <p className="muted">No activity yet</p>
            ) : (
              activity.map((entry) => (
                <div key={entry.id} className={`activity-entry ${entry.status}`}>
                  <div className="activity-action">{entry.action}</div>
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
