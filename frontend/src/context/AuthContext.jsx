import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { pinStorage } from "@/lib/api";

const Ctx = createContext(null);
const COMPANY_KEY = "jb_active_company_id";
const IMPERSONATION_KEY = "jb_admin_impersonating";

const attachSubscriptions = async (companies) => {
  const ids = companies.map((company) => company.id).filter(Boolean);
  if (!ids.length) return companies;
  const { data, error } = await supabase
    .from("company_subscriptions")
    .select("company_id,plan_code,billing_cycle,status,current_period_start,current_period_end,trial_ends_at,cancel_at_period_end,blocked_reason")
    .in("company_id", ids);
  if (error) throw error;
  const byCompany = Object.fromEntries((data || []).map((subscription) => [subscription.company_id, subscription]));
  return companies.map((company) => ({
    ...company,
    subscription: byCompany[company.id] || {
      plan_code: "starter",
      billing_cycle: "monthly",
      status: "incomplete",
      blocked_reason: "Abonnement non configurÃ©",
    },
  }));
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [activeCompanyId, setActiveCompanyIdState] = useState(localStorage.getItem(COMPANY_KEY));
  const [loading, setLoading] = useState(true);

  const loadCompanies = useCallback(async (authUser) => {
    if (!authUser) {
      setCompanies([]);
      setIsPlatformAdmin(false);
      return;
    }

    const { data: adminRows, error: adminError } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", authUser.id)
      .limit(1);
    if (adminError) throw adminError;
    const platformAdmin = Boolean(adminRows?.length);
    setIsPlatformAdmin(platformAdmin);

    let available = [];
    if (platformAdmin) {
      const { data, error } = await supabase
        .from("companies")
        .select("id,name,slug,legal_name,siret,email,phone,city,logo_url,locale,timezone,status,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      available = await attachSubscriptions((data || []).map((company) => ({
        ...company,
        role: "platform_admin",
        membershipStatus: "platform_admin",
      })));
    } else {
      const { data, error } = await supabase
        .from("company_members")
        .select("company_id,role,status,permissions,company:companies(id,name,slug,legal_name,siret,email,phone,city,logo_url,locale,timezone,status,created_at)")
        .eq("user_id", authUser.id)
        .eq("status", "active");
      if (error) throw error;
      available = await attachSubscriptions((data || []).map((item) => ({
        ...item.company,
        role: item.role,
        permissions: item.permissions || {},
        membershipStatus: item.status,
      })).filter(Boolean));
    }

    setCompanies(available);
    const stored = localStorage.getItem(COMPANY_KEY);
    const storedCompany = available.find((company) => company.id === stored);
    const impersonating = localStorage.getItem(IMPERSONATION_KEY) === "1";

    if (storedCompany && (!platformAdmin || impersonating)) {
      setActiveCompanyIdState(storedCompany.id);
    } else if (!platformAdmin && available.length === 1) {
      localStorage.setItem(COMPANY_KEY, available[0].id);
      setActiveCompanyIdState(available[0].id);
    } else {
      localStorage.removeItem(COMPANY_KEY);
      if (platformAdmin) localStorage.removeItem(IMPERSONATION_KEY);
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
          setIsPlatformAdmin(false);
          setLoading(false);
        }
      }
    };

    bootstrap();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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

  useEffect(() => {
    const expired = () => {
      sessionStorage.setItem("jb_login_message", "Votre session a expirÃ©. Reconnectez-vous pour continuer.");
      setSession(null);
      setUser(null);
      window.location.replace("/login");
    };
    window.addEventListener("jb:session-expired", expired);
    return () => window.removeEventListener("jb:session-expired", expired);
  }, []);

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const logout = async () => {
    pinStorage.clear();
    localStorage.removeItem(COMPANY_KEY);
    localStorage.removeItem(IMPERSONATION_KEY);
    setActiveCompanyIdState(null);
    Object.keys(localStorage).filter((key) => key.startsWith("jb_") && !key.startsWith("jb_theme_")).forEach((key) => localStorage.removeItem(key));
    if ("caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("jb-")).map((key) => window.caches.delete(key)));
    }
    await supabase.auth.signOut({ scope: "local" });
    window.history.replaceState(null, "", "/login");
    window.location.replace("/login");
  };

  const setActiveCompanyId = (companyId) => {
    if (!companies.some((company) => company.id === companyId)) return;
    pinStorage.clear();
    localStorage.setItem(COMPANY_KEY, companyId);
    if (isPlatformAdmin) localStorage.setItem(IMPERSONATION_KEY, "1");
    setActiveCompanyIdState(companyId);
    window.location.assign("/");
  };

  const stopImpersonation = () => {
    pinStorage.clear();
    localStorage.removeItem(COMPANY_KEY);
    localStorage.removeItem(IMPERSONATION_KEY);
    setActiveCompanyIdState(null);
    window.location.assign("/admin");
  };

  return (
    <Ctx.Provider value={{
      session,
      user,
      companies,
      isPlatformAdmin,
      activeCompanyId,
      activeCompany: companies.find((company) => company.id === activeCompanyId) || null,
      isImpersonating: isPlatformAdmin && Boolean(activeCompanyId),
      setActiveCompanyId,
      stopImpersonation,
      refreshCompanies: () => loadCompanies(session?.user || null),
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
