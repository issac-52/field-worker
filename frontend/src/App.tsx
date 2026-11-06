import { SessionGate } from './context/SessionGate';
import { WorkProvider } from './context/WorkContext';
import { NotificationProvider } from './context/NotificationContext';
import { AppShell } from './components/layout/AppShell';
import { PageContent } from './components/layout/PageContent';

export default function App() {
  return (
    <SessionGate>
      <WorkProvider>
        <NotificationProvider>
          <AppShell>
            <PageContent />
          </AppShell>
        </NotificationProvider>
      </WorkProvider>
    </SessionGate>
  );
}
