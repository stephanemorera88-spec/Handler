import { useState, FormEvent } from 'react';
import { useAuthStore } from '../stores/authStore';

export function LoginScreen() {
  const [password, setPassword] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const { login, loading, error } = useAuthStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    await login(password.trim());
  };

  return (
    <div style={styles.page}>
      {/* Hero */}
      <div style={styles.hero}>
        <div style={styles.logoMark}>H</div>
        <h1 style={styles.title}>Handler</h1>
        <p style={styles.tagline}>
          One place for all your AI agents.
        </p>
        <p style={styles.subtitle}>
          Chat with Claude, GPT, Gemini, and custom agents — all in one dedicated space,
          separate from your personal messages.
        </p>

        {!showLogin ? (
          <button style={styles.ctaButton} onClick={() => setShowLogin(true)}>
            Sign In
          </button>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              style={styles.input}
            />
            <button
              type="submit"
              disabled={loading}
              style={{ ...styles.submitButton, ...(loading ? styles.disabled : {}) }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            {error && <p style={styles.error}>{error}</p>}
          </form>
        )}
      </div>

      {/* Features */}
      <div style={styles.features}>
        <div style={styles.feature}>
          <div style={styles.featureIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h3 style={styles.featureTitle}>Multi-Provider Chat</h3>
          <p style={styles.featureDesc}>
            Claude, OpenAI, Gemini, and external agents — all in one interface with real-time streaming.
          </p>
        </div>

        <div style={styles.feature}>
          <div style={styles.featureIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h3 style={styles.featureTitle}>Group Conversations</h3>
          <p style={styles.featureDesc}>
            Put multiple agents in one chat. They all respond to your messages in parallel.
          </p>
        </div>

        <div style={styles.feature}>
          <div style={styles.featureIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h3 style={styles.featureTitle}>Private & Self-Hosted</h3>
          <p style={styles.featureDesc}>
            Your data stays on your machine. No third-party accounts. Deploy anywhere with Docker.
          </p>
        </div>
      </div>

      {/* Footer hint */}
      {showLogin && (
        <p style={styles.hint}>
          Your password is the <code style={styles.code}>HANDLER_SECRET</code> environment variable,
          or was printed to the server console on first run.
        </p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary)',
    padding: '40px 20px',
    gap: '48px',
    overflow: 'auto',
  },
  hero: {
    textAlign: 'center',
    maxWidth: '480px',
  },
  logoMark: {
    width: '56px',
    height: '56px',
    borderRadius: '16px',
    background: 'var(--accent, #6366f1)',
    color: '#fff',
    fontSize: '28px',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
    letterSpacing: '-1px',
  },
  title: {
    fontSize: '36px',
    fontWeight: 800,
    letterSpacing: '-1px',
    color: 'var(--text-primary)',
    marginBottom: '12px',
  },
  tagline: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '15px',
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    marginBottom: '28px',
  },
  ctaButton: {
    padding: '14px 48px',
    fontSize: '16px',
    fontWeight: 700,
    background: 'var(--accent, #6366f1)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxWidth: '320px',
    margin: '0 auto',
  },
  input: {
    padding: '14px 16px',
    fontSize: '15px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    color: 'var(--text-primary)',
    outline: 'none',
    fontFamily: 'inherit',
    textAlign: 'center',
  },
  submitButton: {
    padding: '14px',
    fontSize: '15px',
    fontWeight: 600,
    background: 'var(--accent, #6366f1)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  disabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  error: {
    fontSize: '13px',
    color: 'var(--danger, #f87171)',
    textAlign: 'center',
  },
  features: {
    display: 'flex',
    gap: '24px',
    maxWidth: '720px',
    width: '100%',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  feature: {
    flex: '1 1 200px',
    maxWidth: '220px',
    textAlign: 'center',
  },
  featureIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: 'var(--bg-secondary, #1a1a2e)',
    color: 'var(--accent, #6366f1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 12px',
  },
  featureTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: '6px',
  },
  featureDesc: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  hint: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    textAlign: 'center',
  },
  code: {
    background: 'var(--bg-tertiary)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
  },
};
