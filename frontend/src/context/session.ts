import { createContext, useContext } from 'react';
import type { User } from '../types';
export const SessionContext = createContext<{
  user: User | null;
  logout: () => Promise<void>;
  changePassword: () => void;
}>({ user: null, logout: async () => {}, changePassword: () => {} });
export const useSession = () => useContext(SessionContext);
