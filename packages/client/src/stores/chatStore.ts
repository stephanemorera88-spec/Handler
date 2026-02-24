import { create } from 'zustand';
import toast from 'react-hot-toast';
import { authHeaders } from './authStore';

interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  content_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  streaming?: boolean;
}

interface Conversation {
  id: string;
  agent_id: string;
  title: string;
  session_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SearchResult {
  id: string;
  conversation_id: string;
  content: string;
  role: string;
  created_at: string;
  conversation_title: string;
}

interface ChatStore {
  conversations: Conversation[];
  selectedConversationId: string | null;
  messages: Message[];
  loading: boolean;
  streaming: boolean;
  searchResults: SearchResult[];
  searchQuery: string;

  setConversations: (conversations: Conversation[]) => void;
  selectConversation: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  appendToMessage: (id: string, content: string) => void;
  setStreaming: (streaming: boolean) => void;

  fetchConversations: (agentId: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  createConversation: (agentId: string, title?: string) => Promise<Conversation>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  searchMessages: (agentId: string, query: string) => Promise<void>;
  clearSearch: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  selectedConversationId: null,
  messages: [],
  loading: false,
  streaming: false,
  searchResults: [],
  searchQuery: '',

  setConversations: (conversations) => set({ conversations }),
  selectConversation: (id) => set({ selectedConversationId: id, messages: id ? get().messages : [] }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  updateMessage: (id, updates) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  appendToMessage: (id, content) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + content } : m
      ),
    })),
  setStreaming: (streaming) => set({ streaming }),

  fetchConversations: async (agentId) => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/agents/${agentId}/conversations`, { headers: authHeaders() });
      const conversations = await res.json();
      set({ conversations, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchMessages: async (conversationId) => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, { headers: authHeaders() });
      const { data } = await res.json();
      set({ messages: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createConversation: async (agentId, title) => {
    const res = await fetch(`/api/agents/${agentId}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ title }),
    });
    const conversation = await res.json();
    set((s) => ({ conversations: [conversation, ...s.conversations] }));
    return conversation;
  },

  deleteConversation: async (id) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE', headers: authHeaders() });
      const wasSelected = get().selectedConversationId === id;
      set((s) => ({
        conversations: s.conversations.filter((c) => c.id !== id),
        selectedConversationId: wasSelected ? null : s.selectedConversationId,
        messages: wasSelected ? [] : s.messages,
      }));
      toast.success('Conversation deleted');
    } catch {
      toast.error('Failed to delete conversation');
    }
  },

  renameConversation: async (id, title) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ title }),
      });
      const updated = await res.json();
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...updated } : c)),
      }));
    } catch {
      toast.error('Failed to rename conversation');
    }
  },

  searchMessages: async (agentId, query) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    try {
      const res = await fetch(`/api/agents/${agentId}/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
      const results = await res.json();
      set({ searchResults: results });
    } catch {
      set({ searchResults: [] });
    }
  },

  clearSearch: () => set({ searchResults: [], searchQuery: '' }),
}));
