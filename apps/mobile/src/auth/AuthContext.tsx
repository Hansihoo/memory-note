import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { createMobileApiClient, MobileApiError, type MobileApiClient, type UserProfile } from "../api/client";
import { flushPendingReviews } from "../pending/pendingReviewQueue";
import { clearAuthToken, loadAuthToken, saveAuthToken } from "./tokenStorage";

type AuthStatus = "loading" | "signedOut" | "signedIn";

interface AuthContextValue {
  status: AuthStatus;
  user: UserProfile | null;
  token: string | null;
  error: string | null;
  apiBaseUrl: string;
  api: MobileApiClient;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(error: unknown): string {
  if (error instanceof MobileApiError && error.status === 401) {
    return "로그인이 필요합니다.";
  }
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const api = useMemo(
    () =>
      createMobileApiClient({
        getToken: () => tokenRef.current
      }),
    []
  );

  const applyToken = useCallback((nextToken: string | null) => {
    tokenRef.current = nextToken;
    setToken(nextToken);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const restoredToken = await loadAuthToken();
        if (!restoredToken) {
          if (!cancelled) {
            setStatus("signedOut");
          }
          return;
        }
        applyToken(restoredToken);
        const restoredUser = await api.me();
        if (!cancelled) {
          setUser(restoredUser);
          setStatus("signedIn");
        }
      } catch (restoreError) {
        await clearAuthToken();
        if (!cancelled) {
          applyToken(null);
          setUser(null);
          setError(errorMessage(restoreError));
          setStatus("signedOut");
        }
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, [api, applyToken]);

  useEffect(() => {
    if (status === "signedIn") {
      void flushPendingReviews(api);
    }
  }, [api, status]);

  const login = useCallback(
    async (username: string, password: string) => {
      setError(null);
      const result = await api.login({ username, password });
      await saveAuthToken(result.token);
      applyToken(result.token);
      setUser(result.user);
      setStatus("signedIn");
    },
    [api, applyToken]
  );

  const register = useCallback(
    async (username: string, password: string) => {
      setError(null);
      const result = await api.register({ username, password });
      await saveAuthToken(result.token);
      applyToken(result.token);
      setUser(result.user);
      setStatus("signedIn");
    },
    [api, applyToken]
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Local logout should still clear the token if the server request fails.
    } finally {
      await clearAuthToken();
      applyToken(null);
      setUser(null);
      setStatus("signedOut");
    }
  }, [api, applyToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      token,
      error,
      apiBaseUrl: api.getApiBaseUrl(),
      api,
      login,
      register,
      logout
    }),
    [api, error, login, logout, register, status, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
