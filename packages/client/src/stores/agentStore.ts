import { create } from 'zustand';

interface Agent {
  id: string;
  name: string;
  description: string;
  provider: string;
  model: string;
  system_prompt: string;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  container_id: string | null;
  permissions: Record<string, unknown>;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface AgentStore {
  agents: Agent[];
  selectedAgentId: string | null;
  loading: boolean;
  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  selectAgent: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  fetchAgents: () => Promise<void>;
  createAgent: (input: {
    name: string;
    description?: string;
    provider: string;
    model: string;
    system_prompt?: string;
  }) => Promise<Agent>;
  startAgent: (id: string) => Promise<void>;
  stopAgent: (id: string) => Promise<void>;
  killAgent: (id: string) => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  selectedAgentId: null,
  loading: false,

  setAgents: (agents) => set({ agents }),
  addAgent: (agent) => set((s) => ({ agents: [agent, ...s.agents] })),
  updateAgent: (id, updates) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),
  selectAgent: (id) => set({ selectedAgentId: id }),
  setLoading: (loading) => set({ loading }),

  fetchAgents: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/agents');
      const agents = await res.json();
      set({ agents, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createAgent: async (input) => {
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const agent = await res.json();
    get().addAgent(agent);
    return agent;
  },

  startAgent: async (id) => {
    get().updateAgent(id, { status: 'starting' });
    const res = await fetch(`/api/agents/${id}/start`, { method: 'POST' });
    const updated = await res.json();
    get().updateAgent(id, updated);
  },

  stopAgent: async (id) => {
    get().updateAgent(id, { status: 'stopping' });
    const res = await fetch(`/api/agents/${id}/stop`, { method: 'POST' });
    const updated = await res.json();
    get().updateAgent(id, updated);
  },

  killAgent: async (id) => {
    const res = await fetch(`/api/agents/${id}/kill`, { method: 'POST' });
    const updated = await res.json();
    get().updateAgent(id, updated);
  },
}));
