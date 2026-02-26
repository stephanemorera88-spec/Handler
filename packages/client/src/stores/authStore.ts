import { create } from 'zustand';

const TOKEN_KEY = 'handler_token';

interface AuthStore {
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  verify: () => Promise<boolean>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  loading: false,
  error: null,

  login: async (password: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Login failed' }));
        set({ loading: false, error: data.error || 'Invalid password' });
        return false;
      }

      const { token } = await res.json();
      localStorage.setItem(TOKEN_KEY, token);
      set({ token, loading: false, error: null });
      return true;
    } catch {
      set({ loading: false, error: 'Could not connect to server' });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, error: null });
  },

  verify: async () => {
    const token = get().token;
    if (!token) return false;

    try {
      const res = await fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        localStorage.removeItem(TOKEN_KEY);
        set({ token: null });
        return false;
      }
      return true;
    } catch {
      // Network failure — clear stale token to avoid broken auth state
      localStorage.removeItem(TOKEN_KEY);
      set({ token: null });
      return false;
    }
  },
}));

/**
 * Helper to get auth headers for fetch requests.
 */
export function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
