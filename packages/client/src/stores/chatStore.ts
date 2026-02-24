import { create } from 'zustand';

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

interface ChatStore {
  conversations: Conversation[];
  selectedConversationId: string | null;
  messages: Message[];
  loading: boolean;
  streaming: boolean;

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
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  selectedConversationId: null,
  messages: [],
  loading: false,
  streaming: false,

  setConversations: (conversations) => set({ conversations }),
  selectConversation: (id) => set({ selectedConversationId: id }),
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
      const res = await fetch(`/api/agents/${agentId}/conversations`);
      const conversations = await res.json();
      set({ conversations, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchMessages: async (conversationId) => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      const { data } = await res.json();
      set({ messages: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createConversation: async (agentId, title) => {
    const res = await fetch(`/api/agents/${agentId}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const conversation = await res.json();
    set((s) => ({ conversations: [conversation, ...s.conversations] }));
    return conversation;
  },
}));
