import type { ReactNode } from 'react';
import { useWorkController } from '../hooks/useWorkController';

import { WorkContext } from './work';

export function WorkProvider({ children }: { children: ReactNode }) {
  const value = useWorkController();
  return <WorkContext.Provider value={value}>{children}</WorkContext.Provider>;
}
