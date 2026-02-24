import { useState } from 'react';
import { useAgentStore } from '../../stores/agentStore';

interface Props {
  agentId: string;
  status: string;
}

export function KillSwitch({ agentId, status }: Props) {
  const { startAgent, stopAgent, killAgent } = useAgentStore();
  const [confirming, setConfirming] = useState(false);

  const isRunning = status === 'running';
  const isStopped = status === 'stopped' || status === 'error';

  if (confirming) {
    return (
      <div className="kill-switch-confirm">
        <span>Force kill?</span>
        <button
          className="btn btn-danger btn-sm"
          onClick={() => { killAgent(agentId); setConfirming(false); }}
        >
          Kill
        </button>
        <button
          className="btn btn-sm"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="kill-switch">
      {isStopped ? (
        <button className="btn btn-success" onClick={() => startAgent(agentId)}>
          Start
        </button>
      ) : (
        <>
          <button className="btn btn-warning" onClick={() => stopAgent(agentId)}>
            Stop
          </button>
          <button
            className="btn btn-danger"
            onClick={() => setConfirming(true)}
          >
            Kill
          </button>
        </>
      )}
    </div>
  );
}
