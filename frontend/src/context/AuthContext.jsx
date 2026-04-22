import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const r = await api.get("/auth/me");
      setUser(r.data);
    } catch (e) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // If returning from OAuth callback, skip /me check. AuthCallback will process.
    if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, []);

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) {}
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <Ctx.Provider value={{ user, setUser, loading, logout, checkAuth }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
