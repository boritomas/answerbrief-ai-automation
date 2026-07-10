import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import type { User } from './types';

const tokenKey = 'answerbrief.mobile.sessionToken';

type AuthContextValue = {
  booting: boolean;
  email?: string;
  signOut: () => Promise<void>;
  setSession: (token: string) => Promise<void>;
  token: string | null;
  user?: User;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | undefined>();

  const loadUser = useCallback(async (sessionToken: string) => {
    const response = await api.me(sessionToken);
    setUser(response.user);
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(tokenKey)
      .then(async (storedToken) => {
        if (storedToken) {
          setToken(storedToken);
          await loadUser(storedToken).catch(() => SecureStore.deleteItemAsync(tokenKey));
        }
      })
      .finally(() => setBooting(false));
  }, [loadUser]);

  const setSession = useCallback(async (sessionToken: string) => {
    await SecureStore.setItemAsync(tokenKey, sessionToken);
    setToken(sessionToken);
    await loadUser(sessionToken);
  }, [loadUser]);

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(tokenKey);
    setToken(null);
    setUser(undefined);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    booting,
    email: user?.email,
    signOut,
    setSession,
    token,
    user
  }), [booting, signOut, setSession, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
