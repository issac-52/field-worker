import { useRef, useState } from 'react';
import { useWork } from '../context/work';
import { useNotify } from '../context/notification';

export function useSaveAction() {
  const { refresh } = useWork();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  async function save(action: () => Promise<unknown>, message: string) {
    if (inFlight.current) return false;
    inFlight.current = true;
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
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { busy, error, save };
}
