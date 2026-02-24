import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ChatView } from './components/chat/ChatView';
import { ActivityPanel } from './components/activity/ActivityPanel';
import { ApprovalQueue } from './components/approvals/ApprovalQueue';
import { LoginScreen } from './components/LoginScreen';
import { useWebSocket } from './hooks/useWebSocket';
import { useUIStore } from './stores/uiStore';
import { useAuthStore } from './stores/authStore';

function AuthenticatedApp() {
  const { sendMessage } = useWebSocket();
  const { sidebarOpen, closeSidebar } = useUIStore();

  return (
    <div className="app">
      {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}
      <Sidebar />
      <div className="main">
        <Header />
        <ApprovalQueue />
        <ChatView sendMessage={sendMessage} />
        <ActivityPanel />
      </div>
    </div>
  );
}

export default function App() {
  const token = useAuthStore((s) => s.token);
  const verify = useAuthStore((s) => s.verify);
  const [checking, setChecking] = useState(!!token); // Only check if we have a stored token

  useEffect(() => {
    if (token) {
      verify().finally(() => setChecking(false));
    }
  }, []);

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1e1e1e',
            color: '#e0e0e0',
            border: '1px solid #333',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#4ade80', secondary: '#1e1e1e' } },
          error: { iconTheme: { primary: '#f87171', secondary: '#1e1e1e' }, duration: 5000 },
        }}
      />
      {checking ? null : token ? <AuthenticatedApp /> : <LoginScreen />}
    </>
  );
}
