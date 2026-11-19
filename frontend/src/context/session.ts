import { createContext, useContext } from 'react';
import type { User } from '../types';
export const SessionContext = createContext<{
  user: User | null;
  logout: () => Promise<void>;
  changePassword: () => void;
  openOffline: () => void;
}>({ user: null, logout: async () => {}, changePassword: () => {}, openOffline: () => {} });
export const useSession = () => useContext(SessionContext);
