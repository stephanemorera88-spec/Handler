interface Props {
  status: string;
}

const statusColors: Record<string, string> = {
  stopped: '#6b7280',
  starting: '#f59e0b',
  running: '#10b981',
  stopping: '#f59e0b',
  error: '#ef4444',
};

export function StatusBadge({ status }: Props) {
  const color = statusColors[status] || '#6b7280';

  return (
    <span className="status-badge" style={{ '--status-color': color } as React.CSSProperties}>
      <span className="status-dot" />
      {status}
    </span>
  );
}
