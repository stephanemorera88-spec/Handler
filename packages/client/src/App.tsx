import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ChatView } from './components/chat/ChatView';
import { ActivityPanel } from './components/activity/ActivityPanel';
import { ApprovalQueue } from './components/approvals/ApprovalQueue';
import { useWebSocket } from './hooks/useWebSocket';

export default function App() {
  const { sendMessage } = useWebSocket();

  return (
    <div className="app">
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
