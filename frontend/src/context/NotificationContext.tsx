import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';

const NotificationContext = createContext<((message: string) => void) | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const notify = useCallback((value: string) => {
    clearTimeout(timer.current);
    setMessage(value);
    timer.current = setTimeout(() => setMessage(''), 3500);
  }, []);
  return (
    <NotificationContext.Provider value={notify}>
      {children}
      {message && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {message}
        </div>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotify() {
  const notify = useContext(NotificationContext);
  if (!notify) throw new Error('useNotify requires NotificationProvider');
  return notify;
}
