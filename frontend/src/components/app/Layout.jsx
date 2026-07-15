import React, { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, CalendarClock, Users, Receipt, Package, Settings as SettingsIcon, Scissors, TrendingUp, Route, AlertCircle, Search, Lock, Map as MapIcon, Bell, ChevronDown, LogOut, Moon, Sun } from "lucide-react";
import { api, pinStorage } from "@/lib/api";
import GlobalSearch from "@/components/app/GlobalSearch";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";

const NAV = [
  { to: "/", label: "Accueil", icon: LayoutDashboard, tid: "nav-dashboard" },
  { to: "/rdv", label: "RDV", icon: CalendarClock, tid: "nav-rdv" },
  { to: "/clients", label: "Clients", icon: Users, tid: "nav-clients" },
  { to: "/compta", label: "Compta", icon: Receipt, tid: "nav-compta" },
  { to: "/analytics", label: "Stats", icon: TrendingUp, tid: "nav-analytics" },
];

const MORE = [
  { to: "/demandes", label: "Demandes", icon: Bell, tid: "nav-demandes", badge: true },
  { to: "/tour", label: "TournÃ©e", icon: Route, tid: "nav-tour" },
  { to: "/carte", label: "Carte", icon: MapIcon, tid: "nav-map" },
  { to: "/clients-status", label: "Risque", icon: AlertCircle, tid: "nav-clients-status" },
  { to: "/stock", label: "Stock", icon: Package, tid: "nav-stock" },
  { to: "/equipe", label: "Ã‰quipe", icon: Users, tid: "nav-team" },
  { to: "/reglages", label: "RÃ©glages", icon: SettingsIcon, tid: "nav-settings" },
];

const ALL_MENUS = [...NAV, ...MORE];

export default function Layout({ children }) {
  const location = useLocation();
  const { activeCompany, activeCompanyId, companies, setActiveCompanyId, isImpersonating, stopImpersonation, logout } = useAuth();
  const { preference, toggle } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const menuRef = useRef(null);

  // Poll pending appointment requests every 60s
  useEffect(() => {
    let alive = true;
    const load = () => {
      api.get("/appointment-requests/pending-count")
        .then((r) => { if (alive) setPendingCount(r.data?.count || 0); })
        .catch(() => {});
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  // Close quick menu on navigation
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Close quick menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  // Global keyboard shortcut: "/" opens search
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      if (e.key === "/") { e.preventDefault(); setSearchOpen(true); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lockNow = () => {
    pinStorage.clear();
    window.dispatchEvent(new CustomEvent("jb:locked"));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-slate-50 to-blue-50">
      {/* ===== Desktop sidebar (lg+) ===== */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 flex-col bg-white/90 backdrop-blur-xl border-r border-slate-200 z-40" data-testid="desktop-sidebar">
        <div className="px-6 py-6 flex items-center gap-3 border-b border-slate-100">
          {activeCompany?.logo_url ? (
            <img src={activeCompany.logo_url} alt="" className="w-10 h-10 rounded-xl object-contain border border-slate-100" />
          ) : (
            <Scissors className="w-6 h-6 text-[#D4AF37]" strokeWidth={1.5} />
          )}
          <div>
            <div className="font-serif text-xl leading-none">{activeCompany?.name || "Entreprise"}</div>
            <div className="text-[9px] tracking-[0.18em] uppercase text-slate-400 mt-1">{activeCompany?.name || "Entreprise active"}</div>
          </div>
        </div>
        {companies.length > 1 && (
          <div className="px-4 py-3 border-b border-slate-100">
            <label className="text-[9px] tracking-widest uppercase text-slate-400">Entreprise active</label>
            <select value={activeCompanyId || ""} onChange={(e) => setActiveCompanyId(e.target.value)} className="mt-1 w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white">
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </div>
        )}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {ALL_MENUS.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} data-testid={`${n.tid}-desktop`}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition ${
                  isActive ? "bg-[#0A192F] text-white font-medium" : "text-slate-600 hover:bg-slate-50"
                }`
              }
            >
              <n.icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
              <span>{n.label}</span>
              {n.badge && pendingCount > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">{pendingCount > 9 ? "9+" : pendingCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-slate-100 space-y-1">
          <button onClick={() => setSearchOpen(true)} data-testid="sidebar-search" className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
            <Search className="w-4 h-4" strokeWidth={1.5} /> Rechercher <kbd className="ml-auto text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">/</kbd>
          </button>
          <button onClick={lockNow} data-testid="sidebar-lock" className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
            <Lock className="w-4 h-4" strokeWidth={1.5} /> Verrouiller
          </button>
          <button onClick={toggle} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-slate-600 hover:bg-slate-50" aria-label="Changer le thÃ¨me">
            {preference === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />} ThÃ¨me
          </button>
          <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-red-700 hover:bg-red-50">
            <LogOut className="w-4 h-4" /> Se dÃ©connecter
          </button>
        </div>
      </aside>

      {/* ===== Main column ===== */}
      <div className="lg:pl-64 min-h-screen flex flex-col">
        {isImpersonating && (
          <div className="bg-amber-100 border-b border-amber-200 px-5 py-2.5 flex items-center justify-center gap-3 text-sm text-amber-950" data-testid="admin-support-banner">
            <span><strong>Mode assistance :</strong> {activeCompany?.name}</span>
            <button type="button" onClick={stopImpersonation} className="bg-white border border-amber-300 rounded-full px-4 py-1.5 font-medium">Retour au pilotage</button>
          </div>
        )}
        {/* Top bar (mobile + tablet) */}
        <header className="lg:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-100 px-5 py-4 flex items-center justify-between" ref={menuRef}>
          <div className="flex items-center gap-2">
            {activeCompany?.logo_url ? (
              <img src={activeCompany.logo_url} alt="" className="w-9 h-9 rounded-xl object-contain border border-slate-100" />
            ) : (
              <Scissors className="w-5 h-5 text-[#D4AF37]" strokeWidth={1.5} />
            )}
            <div>
              <div className="font-serif text-lg leading-none">{activeCompany?.name || "Entreprise"}</div>
              <div className="text-[9px] tracking-[0.25em] uppercase text-slate-400 mt-1">Espace professionnel</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setSearchOpen(true)} data-testid="topbar-search" className="p-2 rounded-full text-slate-500 hover:bg-slate-50">
              <Search className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              data-testid="topbar-quick-menu"
              aria-label="AccÃ¨s rapide aux menus"
              className={`relative p-2 rounded-full transition ${menuOpen ? "bg-[#0A192F] text-white" : "text-slate-500 hover:bg-slate-50"}`}
            >
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`} strokeWidth={1.5} />
              {pendingCount > 0 && !menuOpen && (
                <span data-testid="pending-badge" className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">{pendingCount > 9 ? "9+" : pendingCount}</span>
              )}
            </button>
            <button onClick={lockNow} data-testid="topbar-lock" className="p-2 rounded-full text-slate-500 hover:bg-slate-50" title="Verrouiller l'app">
              <Lock className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button onClick={toggle} className="p-2 rounded-full text-slate-500 hover:bg-slate-50" aria-label="Changer le thÃ¨me">{preference === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</button>
            <button onClick={logout} className="p-2 rounded-full text-red-700 hover:bg-red-50" aria-label="Se dÃ©connecter"><LogOut className="w-4 h-4" /></button>
          </div>

          {/* Quick menu dropdown */}
          {menuOpen && (
            <div data-testid="quick-menu-panel" className="absolute top-full left-0 right-0 bg-white border-b border-slate-200 shadow-[0_16px_40px_rgba(10,25,47,0.12)] px-4 py-4 animate-fade-up">
              <div className="grid grid-cols-4 gap-2">
                {ALL_MENUS.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.to === "/"} data-testid={`quick-${n.tid}`}
                    className={({ isActive }) =>
                      `relative flex flex-col items-center gap-1.5 py-3 rounded-2xl text-[10px] uppercase tracking-wider transition ${
                        isActive ? "bg-[#0A192F] text-white font-semibold" : "text-slate-500 hover:bg-slate-50"
                      }`
                    }
                  >
                    <n.icon className="w-5 h-5" strokeWidth={1.5} />
                    <span>{n.label}</span>
                    {n.badge && pendingCount > 0 && (
                      <span className="absolute top-1.5 right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">{pendingCount > 9 ? "9+" : pendingCount}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 pb-28 lg:pb-10">
          <div className="px-5 py-5 lg:px-10 lg:py-8 max-w-6xl mx-auto animate-fade-up">
            {children}
          </div>
        </main>

        {/* Bottom nav (mobile only) */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 px-2 py-2 flex justify-between items-center z-50">
          {NAV.map((n, idx) => {
            const activeColor = ["text-[#0A192F]", "text-blue-600", "text-pink-600", "text-green-700", "text-[#C5A059]"][idx] || "text-[#0A192F]";
            return (
              <NavLink key={n.to} to={n.to} end={n.to === "/"} data-testid={`${n.tid}-mobile`}
                className={({ isActive }) =>
                  `flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl text-[10px] uppercase tracking-wider ${
                    isActive ? activeColor + " font-semibold" : "text-slate-400"
                  }`
                }
              >
                <n.icon className="w-5 h-5" strokeWidth={1.5} />
                <span>{n.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
