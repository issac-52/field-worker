import { createContext, useContext } from 'react';

export const NotificationContext = createContext<((message: string) => void) | null>(null);

export function useNotify() {
  const notify = useContext(NotificationContext);
  if (!notify) throw new Error('useNotify requires NotificationProvider');
  return notify;
}
