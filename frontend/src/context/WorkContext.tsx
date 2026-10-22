import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useWorkController } from '../hooks/useWorkController';

const WorkContext = createContext<ReturnType<typeof useWorkController> | null>(null);

export function WorkProvider({ children }: { children: ReactNode }) {
  const value = useWorkController();
  return <WorkContext.Provider value={value}>{children}</WorkContext.Provider>;
}

export function useWork() {
  const context = useContext(WorkContext);
  if (!context) throw new Error('useWork requires WorkProvider');
  return context;
}
