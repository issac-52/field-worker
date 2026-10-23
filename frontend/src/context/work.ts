import { createContext, useContext } from 'react';
import type { useWorkController } from '../hooks/useWorkController';

export const WorkContext = createContext<ReturnType<typeof useWorkController> | null>(null);

export function useWork() {
  const context = useContext(WorkContext);
  if (!context) throw new Error('useWork requires WorkProvider');
  return context;
}
