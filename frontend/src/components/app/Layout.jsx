import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, CalendarClock, Users, Receipt, Package, Settings as SettingsIcon, LogOut, Scissors } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { to: "/", label: "Accueil", icon: LayoutDashboard, tid: "nav-dashboard" },
  { to: "/rdv", label: "Rendez-vous", icon: CalendarClock, tid: "nav-rdv" },
  { to: "/clients", label: "Clients", icon: Users, tid: "nav-clients" },
  { to: "/compta", label: "Comptabilité", icon: Receipt, tid: "nav-compta" },
  { to: "/stock", label: "Stock", icon: Package, tid: "nav-stock" },
  { to: "/reglages", label: "Réglages", icon: SettingsIcon, tid: "nav-settings" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-white text-[#0A192F]">
      {/* Top bar mobile */}
      <header className="md:hidden sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-100 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scissors className="w-5 h-5 text-[#D4AF37]" strokeWidth={1.5} />
          <div className="font-serif text-xl leading-none">Julien Bouche</div>
        </div>
        <button onClick={logout} data-testid="logout-mobile-btn" className="text-xs uppercase tracking-widest text-slate-500">
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:flex-col w-64 bg-[#F8FAFC] border-r border-slate-100 min-h-screen sticky top-0 px-6 py-8">
          <div className="flex items-center gap-2 mb-10">
            <Scissors className="w-6 h-6 text-[#D4AF37]" strokeWidth={1.25} />
            <div>
              <div className="font-serif text-2xl leading-tight">Julien Bouche</div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-slate-500">Coiffure à domicile</div>
            </div>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                data-testid={n.tid}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-full text-sm transition-colors ${
                    isActive ? "bg-[#0A192F] text-white" : "text-slate-600 hover:bg-white"
                  }`
                }
              >
                <n.icon className="w-4 h-4" strokeWidth={1.5} />
                <span>{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto pt-6 border-t border-slate-200">
            {user && (
              <div className="flex items-center gap-3 px-2 mb-4">
                {user.picture ? (
                  <img src={user.picture} alt="" className="w-9 h-9 rounded-full" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#0A192F] text-white flex items-center justify-center text-sm font-semibold">
                    {(user.name || "J")[0]}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{user.name}</div>
                  <div className="text-xs text-slate-500 truncate">{user.email}</div>
                </div>
              </div>
            )}
            <button onClick={logout} data-testid="logout-btn" className="w-full flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-sm hover:bg-white">
              <LogOut className="w-4 h-4" /> Se déconnecter
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 pb-28 md:pb-10">
          <div className="app-shell px-5 md:px-10 py-6 md:py-10 animate-fade-up">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 px-2 py-2 flex justify-between items-center z-50">
        {NAV.slice(0, 5).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} data-testid={`${n.tid}-mobile`}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl text-[10px] uppercase tracking-wider ${
                isActive ? "text-[#0A192F]" : "text-slate-400"
              }`
            }
          >
            <n.icon className="w-5 h-5" strokeWidth={1.5} />
            <span>{n.label.split(" ")[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
