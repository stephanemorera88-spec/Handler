import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ChatView } from './components/chat/ChatView';
import { ActivityPanel } from './components/activity/ActivityPanel';
import { ApprovalQueue } from './components/approvals/ApprovalQueue';
import { useWebSocket } from './hooks/useWebSocket';
import { useUIStore } from './stores/uiStore';

export default function App() {
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
