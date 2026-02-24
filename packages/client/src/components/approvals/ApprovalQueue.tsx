import { useEffect } from 'react';
import { useActivityStore } from '../../stores/activityStore';

export function ApprovalQueue() {
  const { pendingApprovals, fetchApprovals, resolveApproval } = useActivityStore();

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  if (pendingApprovals.length === 0) return null;

  return (
    <div className="approval-queue">
      <h3>Pending Approvals ({pendingApprovals.length})</h3>
      {pendingApprovals.map((approval) => (
        <div key={approval.id} className="approval-card">
          <div className="approval-type">
            {approval.action_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </div>
          <div className="approval-detail">{approval.action_detail}</div>
          <div className="approval-actions">
            <button
              className="btn btn-success btn-sm"
              onClick={() => resolveApproval(approval.id, 'approved')}
            >
              Approve
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => resolveApproval(approval.id, 'denied')}
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
