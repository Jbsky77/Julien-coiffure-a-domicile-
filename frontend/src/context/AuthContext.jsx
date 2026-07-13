import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { pinStorage } from "@/lib/api";

const Ctx = createContext(null);
const COMPANY_KEY = "jb_active_company_id";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState(localStorage.getItem(COMPANY_KEY));
  const [loading, setLoading] = useState(true);

  const loadCompanies = useCallback(async (authUser) => {
    if (!authUser) {
      setCompanies([]);
      return;
    }
    const { data, error } = await supabase
      .from("company_members")
      .select("company_id,role,status,company:companies(id,name,slug,locale,timezone,status)")
      .eq("user_id", authUser.id)
      .eq("status", "active");
    if (error) throw error;
    const available = (data || []).map((item) => ({
      ...item.company,
      role: item.role,
      membershipStatus: item.status,
    })).filter(Boolean);
    setCompanies(available);
    const stored = localStorage.getItem(COMPANY_KEY);
    const selected = available.find((company) => company.id === stored) || (available.length === 1 ? available[0] : null);
    if (selected) {
      localStorage.setItem(COMPANY_KEY, selected.id);
      setActiveCompanyIdState(selected.id);
    } else {
      localStorage.removeItem(COMPANY_KEY);
      setActiveCompanyIdState(null);
    }
  }, []);

  const applySession = useCallback(async (nextSession) => {
    setSession(nextSession);
    const authUser = nextSession?.user || null;
    setUser(authUser ? {
      user_id: authUser.id,
      email: authUser.email,
      name: authUser.email?.toLowerCase() === "julien46bouche@gmail.com" ? "Bouche Julien" : authUser.email,
      picture: "",
    } : null);
    try {
      await loadCompanies(authUser);
    } finally {
      setLoading(false);
    }
  }, [loadCompanies]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (mounted) await applySession(data.session);
      } catch (error) {
        console.error("Impossible de restaurer la session", error);
        if (mounted) {
          setSession(null);
          setUser(null);
          setCompanies([]);
          setLoading(false);
        }
      }
    };

    bootstrap();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Supabase recommends returning from this callback immediately. Deferring
      // company loading prevents an authentication lock that can freeze startup.
      window.setTimeout(() => {
        if (mounted) applySession(nextSession).catch((error) => {
          console.error("Impossible d'actualiser la session", error);
          setLoading(false);
        });
      }, 0);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const logout = async () => {
    pinStorage.clear();
    localStorage.removeItem(COMPANY_KEY);
    setActiveCompanyIdState(null);
    await supabase.auth.signOut();
  };

  const setActiveCompanyId = (companyId) => {
    if (!companies.some((company) => company.id === companyId)) return;
    pinStorage.clear();
    localStorage.setItem(COMPANY_KEY, companyId);
    setActiveCompanyIdState(companyId);
    window.location.assign("/");
  };

  return (
    <Ctx.Provider value={{
      session,
      user,
      companies,
      activeCompanyId,
      activeCompany: companies.find((company) => company.id === activeCompanyId) || null,
      setActiveCompanyId,
      loading,
      signIn,
      logout,
      checkAuth: async () => {
        const { data } = await supabase.auth.getSession();
        await applySession(data.session);
      },
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
