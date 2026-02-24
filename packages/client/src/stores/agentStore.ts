import { create } from 'zustand';
import toast from 'react-hot-toast';

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
  removeAgent: (id: string) => void;
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
  editAgent: (id: string, updates: Record<string, unknown>) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
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
  removeAgent: (id) =>
    set((s) => ({
      agents: s.agents.filter((a) => a.id !== id),
      selectedAgentId: s.selectedAgentId === id ? null : s.selectedAgentId,
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
      toast.error('Failed to load agents');
    }
  },

  createAgent: async (input) => {
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const agent = await res.json();
      get().addAgent(agent);
      toast.success(`${agent.name} created`);
      return agent;
    } catch {
      toast.error('Failed to create agent');
      throw new Error('Failed to create agent');
    }
  },

  editAgent: async (id, updates) => {
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const agent = await res.json();
      get().updateAgent(id, agent);
      toast.success('Agent updated');
    } catch {
      toast.error('Failed to update agent');
    }
  },

  deleteAgent: async (id) => {
    try {
      await fetch(`/api/agents/${id}`, { method: 'DELETE' });
      get().removeAgent(id);
      toast.success('Agent deleted');
    } catch {
      toast.error('Failed to delete agent');
    }
  },

  startAgent: async (id) => {
    try {
      get().updateAgent(id, { status: 'starting' });
      const res = await fetch(`/api/agents/${id}/start`, { method: 'POST' });
      const updated = await res.json();
      get().updateAgent(id, updated);
      const agent = get().agents.find((a) => a.id === id);
      toast.success(`${agent?.name || 'Agent'} started`);
    } catch {
      get().updateAgent(id, { status: 'error' });
      toast.error('Failed to start agent');
    }
  },

  stopAgent: async (id) => {
    try {
      get().updateAgent(id, { status: 'stopping' });
      const res = await fetch(`/api/agents/${id}/stop`, { method: 'POST' });
      const updated = await res.json();
      get().updateAgent(id, updated);
      toast.success('Agent stopped');
    } catch {
      toast.error('Failed to stop agent');
    }
  },

  killAgent: async (id) => {
    try {
      const res = await fetch(`/api/agents/${id}/kill`, { method: 'POST' });
      const updated = await res.json();
      get().updateAgent(id, updated);
      toast('Agent killed', { icon: '💀' });
    } catch {
      toast.error('Failed to kill agent');
    }
  },
}));
