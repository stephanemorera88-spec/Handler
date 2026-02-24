import { create } from 'zustand';
import toast from 'react-hot-toast';
import { authHeaders } from './authStore';

interface ActivityEntry {
  id: string;
  agent_id: string;
  action: string;
  detail: string;
  status: string;
  created_at: string;
}

interface UsageSummary {
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  message_count: number;
}

interface Approval {
  id: string;
  agent_id: string;
  action_type: string;
  action_detail: string;
  status: string;
  created_at: string;
}

interface ActivityStore {
  activities: ActivityEntry[];
  usageSummaries: Record<string, UsageSummary>;
  pendingApprovals: Approval[];

  addActivity: (entry: ActivityEntry) => void;
  setActivities: (entries: ActivityEntry[]) => void;
  updateUsage: (agentId: string, usage: Partial<UsageSummary>) => void;
  setUsageSummary: (agentId: string, summary: UsageSummary) => void;
  addApproval: (approval: Approval) => void;
  removeApproval: (id: string) => void;
  setPendingApprovals: (approvals: Approval[]) => void;

  fetchActivity: (agentId: string) => Promise<void>;
  fetchUsage: (agentId: string) => Promise<void>;
  fetchApprovals: () => Promise<void>;
  resolveApproval: (id: string, status: 'approved' | 'denied') => Promise<void>;
}

export const useActivityStore = create<ActivityStore>((set, get) => ({
  activities: [],
  usageSummaries: {},
  pendingApprovals: [],

  addActivity: (entry) =>
    set((s) => ({ activities: [entry, ...s.activities].slice(0, 100) })),

  setActivities: (entries) => set({ activities: entries }),

  updateUsage: (agentId, usage) =>
    set((s) => ({
      usageSummaries: {
        ...s.usageSummaries,
        [agentId]: {
          total_input_tokens: (s.usageSummaries[agentId]?.total_input_tokens || 0) + (usage.total_input_tokens || 0),
          total_output_tokens: (s.usageSummaries[agentId]?.total_output_tokens || 0) + (usage.total_output_tokens || 0),
          total_cost_usd: (s.usageSummaries[agentId]?.total_cost_usd || 0) + (usage.total_cost_usd || 0),
          message_count: (s.usageSummaries[agentId]?.message_count || 0) + (usage.message_count || 0),
        },
      },
    })),

  setUsageSummary: (agentId, summary) =>
    set((s) => ({ usageSummaries: { ...s.usageSummaries, [agentId]: summary } })),

  addApproval: (approval) =>
    set((s) => ({ pendingApprovals: [approval, ...s.pendingApprovals] })),

  removeApproval: (id) =>
    set((s) => ({ pendingApprovals: s.pendingApprovals.filter((a) => a.id !== id) })),

  setPendingApprovals: (approvals) => set({ pendingApprovals: approvals }),

  fetchActivity: async (agentId) => {
    const res = await fetch(`/api/agents/${agentId}/activity`, { headers: authHeaders() });
    const data = await res.json();
    set({ activities: data });
  },

  fetchUsage: async (agentId) => {
    const res = await fetch(`/api/agents/${agentId}/usage`, { headers: authHeaders() });
    const summary = await res.json();
    get().setUsageSummary(agentId, summary);
  },

  fetchApprovals: async () => {
    const res = await fetch('/api/approvals?status=pending', { headers: authHeaders() });
    const data = await res.json();
    set({ pendingApprovals: data });
  },

  resolveApproval: async (id, status) => {
    await fetch(`/api/approvals/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ status }),
    });
    get().removeApproval(id);
    toast.success(status === 'approved' ? 'Approved' : 'Denied');
  },
}));
