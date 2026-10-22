import { useState } from 'react';
import { useWork } from '../context/WorkContext';
import { useNotify } from '../context/NotificationContext';

export function useSaveAction() {
  const { refresh } = useWork();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(action: () => Promise<unknown>, message: string) {
    if (busy) return false;
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
      notify(message);
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, save };
}
