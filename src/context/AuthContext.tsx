import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api, type AuthUser } from "../api/client";

type AuthCtx = {
  user: AuthUser | null;
  loading: boolean;
  login: (login: string, password: string, totpCode?: string) => Promise<{ requiresTotp?: boolean }>;
  demoLogin: (login: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user: u } = await api.me();
      setUser(u);
    } catch (e) {
      const err = e as Error & { status?: number };
      // Сеть/API перезапускается — не сбрасываем сессию (иначе теряется ввод в формах)
      if (err.status === 401 || err.status === 403) setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    function onFocus() {
      if (document.activeElement?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void refresh(); }, 600);
    }
    window.addEventListener("focus", onFocus);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const login = async (loginStr: string, password: string, totpCode?: string) => {
    const res = await api.login(loginStr, password, totpCode);
    if ("requiresTotp" in res && res.requiresTotp) return { requiresTotp: true };
    setUser(res.user);
    return {};
  };

  const demoLogin = async (loginStr: string) => {
    const { user: u } = await api.demoLogin(loginStr);
    setUser(u);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, demoLogin, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
