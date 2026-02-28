import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.icon}>!</div>
            <h1 style={styles.title}>Something went wrong</h1>
            <p style={styles.message}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <div style={styles.actions}>
              <button style={styles.button} onClick={this.handleReload}>
                Reload Page
              </button>
              <button style={styles.buttonSecondary} onClick={this.handleReset}>
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-primary, #0a0a0a)',
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    textAlign: 'center',
  },
  icon: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: 'rgba(248, 113, 113, 0.15)',
    color: '#f87171',
    fontSize: '24px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--text-primary, #e0e0e0)',
    marginBottom: '8px',
  },
  message: {
    fontSize: '14px',
    color: 'var(--text-secondary, #888)',
    marginBottom: '28px',
    lineHeight: 1.5,
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  button: {
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 600,
    background: 'var(--accent, #6366f1)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  buttonSecondary: {
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 600,
    background: 'var(--bg-secondary, #1a1a2e)',
    color: 'var(--text-primary, #e0e0e0)',
    border: '1px solid var(--border, #333)',
    borderRadius: '10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
