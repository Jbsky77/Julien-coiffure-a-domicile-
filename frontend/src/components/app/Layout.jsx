import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, CalendarClock, Users, Receipt, Package, Settings as SettingsIcon, LogOut, Scissors, TrendingUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { to: "/", label: "Accueil", icon: LayoutDashboard, tid: "nav-dashboard" },
  { to: "/rdv", label: "RDV", icon: CalendarClock, tid: "nav-rdv" },
  { to: "/clients", label: "Clients", icon: Users, tid: "nav-clients" },
  { to: "/compta", label: "Compta", icon: Receipt, tid: "nav-compta" },
  { to: "/analytics", label: "Stats", icon: TrendingUp, tid: "nav-analytics" },
];

const MORE = [
  { to: "/stock", label: "Stock", icon: Package, tid: "nav-stock" },
  { to: "/reglages", label: "Réglages", icon: SettingsIcon, tid: "nav-settings" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-100 md:flex md:items-start md:justify-center md:py-8">
      {/* Phone frame on desktop */}
      <div className="w-full md:w-[480px] md:rounded-[36px] md:shadow-[0_24px_60px_rgba(10,25,47,0.15)] md:overflow-hidden md:border md:border-slate-200 bg-white min-h-screen md:min-h-[860px] md:max-h-[94vh] md:h-[94vh] relative flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors className="w-5 h-5 text-[#D4AF37]" strokeWidth={1.5} />
            <div>
              <div className="font-serif text-lg leading-none">Julien Bouche</div>
              <div className="text-[9px] tracking-[0.25em] uppercase text-slate-400 mt-1">Coiffure à domicile</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {MORE.map((n) => (
              <NavLink key={n.to} to={n.to} data-testid={n.tid} className={({isActive}) => `p-2 rounded-full ${isActive ? "bg-[#0A192F] text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                <n.icon className="w-4 h-4" strokeWidth={1.5} />
              </NavLink>
            ))}
            <button onClick={logout} data-testid="logout-btn" className="p-2 rounded-full text-slate-500 hover:bg-slate-50"><LogOut className="w-4 h-4" /></button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto pb-28 no-scrollbar">
          <div className="px-5 py-5 animate-fade-up">
            {children}
          </div>
        </main>

        {/* Bottom nav */}
        <nav className="absolute md:rounded-b-[36px] bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 px-2 py-2 flex justify-between items-center z-50">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} data-testid={`${n.tid}-mobile`}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl text-[10px] uppercase tracking-wider ${
                  isActive ? "text-[#0A192F]" : "text-slate-400"
                }`
              }
            >
              <n.icon className="w-5 h-5" strokeWidth={1.5} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
