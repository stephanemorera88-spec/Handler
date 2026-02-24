import { useEffect, useState } from 'react';

interface Approval {
  id: string;
  agent_id: string;
  action_type: string;
  action_detail: string;
  status: string;
  created_at: string;
}

export function ApprovalQueue() {
  const [approvals, setApprovals] = useState<Approval[]>([]);

  const fetchApprovals = async () => {
    const res = await fetch('/api/approvals?status=pending');
    const data = await res.json();
    setApprovals(data);
  };

  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 3000);
    return () => clearInterval(interval);
  }, []);

  const resolve = async (id: string, status: 'approved' | 'denied') => {
    await fetch(`/api/approvals/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchApprovals();
  };

  if (approvals.length === 0) return null;

  return (
    <div className="approval-queue">
      <h3>Pending Approvals ({approvals.length})</h3>
      {approvals.map((approval) => (
        <div key={approval.id} className="approval-card">
          <div className="approval-type">{approval.action_type}</div>
          <div className="approval-detail">{approval.action_detail}</div>
          <div className="approval-actions">
            <button
              className="btn btn-success btn-sm"
              onClick={() => resolve(approval.id, 'approved')}
            >
              Approve
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => resolve(approval.id, 'denied')}
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
