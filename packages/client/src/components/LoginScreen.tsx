import { useState, FormEvent } from 'react';
import { useAuthStore } from '../stores/authStore';

export function LoginScreen() {
  const [password, setPassword] = useState('');
  const { login, loading, error } = useAuthStore();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    await login(password.trim());
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Handler</h1>
        <p style={styles.subtitle}>Enter your password to continue</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            style={styles.input}
          />
          <button type="submit" disabled={loading} style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {error && <p style={styles.error}>{error}</p>}

        <p style={styles.hint}>
          Your password is the <code style={styles.code}>HANDLER_SECRET</code> environment variable,
          or was printed to the server console on first run.
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary)',
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '380px',
    textAlign: 'center',
  },
  title: {
    fontSize: '32px',
    fontWeight: 700,
    letterSpacing: '-0.5px',
    marginBottom: '8px',
    color: 'var(--text-primary)',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    marginBottom: '32px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  input: {
    padding: '14px 16px',
    fontSize: '15px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    color: 'var(--text-primary)',
    outline: 'none',
    fontFamily: 'inherit',
  },
  button: {
    padding: '14px',
    fontSize: '15px',
    fontWeight: 600,
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-lg)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  error: {
    marginTop: '16px',
    fontSize: '13px',
    color: 'var(--danger)',
  },
  hint: {
    marginTop: '24px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  code: {
    background: 'var(--bg-tertiary)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
  },
};
