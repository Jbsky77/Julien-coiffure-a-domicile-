import React, { useEffect, useState, useMemo } from "react";
import { api, money, fmtDate, fmtTime, genderClasses, genderLabel } from "@/lib/api";
import { Link, useNavigate } from "react-router-dom";
import { CalendarClock, Plus, CheckCircle2, Circle, LayoutList, CalendarDays, CalendarRange } from "lucide-react";
import CalendarView from "@/components/app/CalendarView";
import { useAuth } from "@/context/AuthContext";

export default function Appointments() {
  const [list, setList] = useState([]);
  const [clientMap, setClientMap] = useState({});
  const [tab, setTab] = useState("upcoming");
  const [view, setView] = useState("list");
  const [cursor, setCursor] = useState(new Date());
  const [members, setMembers] = useState([]);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const { activeCompany } = useAuth();
  const canSeeAll = ["owner", "admin", "reception", "platform_admin"].includes(activeCompany?.role) || activeCompany?.permissions?.appointments_all;
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const params = employeeFilter === "mine" ? { view: "mine" } : employeeFilter === "unassigned" ? { view: "unassigned" } : employeeFilter ? { employee_id: employeeFilter } : {};
      const [r, c, m] = await Promise.all([api.get("/appointments", { params }), api.get("/clients"), api.get("/company/members")]);
      setList(r.data);
      const map = {};
      c.data.forEach((x) => { map[x.id] = x; });
      setClientMap(map);
      setMembers((m.data.members || []).filter((member) => member.status === "active"));
    })();
  }, [employeeFilter]);

  const now = new Date();
  const upcoming = list.filter((r) => r.status === "scheduled");
  const done = list.filter((r) => r.status === "done");
  const cancelled = list.filter((r) => r.status === "cancelled");
  const shown = tab === "upcoming" ? upcoming : tab === "done" ? done : cancelled;

  return (
    <div className="space-y-8" data-testid="appointments-page">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Agenda</div>
          <h1 className="font-serif text-4xl md:text-5xl tracking-tight">Rendez-vous</h1>
        </div>
        <button onClick={() => navigate("/rdv/nouveau")} data-testid="new-rdv-btn" className="bg-[#0A192F] text-white rounded-full px-6 py-3 text-sm font-medium hover:bg-[#1E3A8A] flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nouveau
        </button>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <button onClick={() => setTab("upcoming")} data-testid="tab-upcoming" className={`px-4 py-2 rounded-full text-sm ${tab === "upcoming" ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>Ã€ venir ({upcoming.length})</button>
        <button onClick={() => setTab("done")} data-testid="tab-done" className={`px-4 py-2 rounded-full text-sm ${tab === "done" ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>Historique ({done.length})</button>
        <button onClick={() => setTab("cancelled")} data-testid="tab-cancelled" className={`px-4 py-2 rounded-full text-sm ${tab === "cancelled" ? "bg-[#991B1B] text-white" : "border border-slate-200 text-slate-600"}`}>AnnulÃ©s ({cancelled.length})</button>
        <div className="flex-1" />
        <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="border border-slate-200 rounded-full px-4 py-2 text-sm bg-white" aria-label="Filtrer par employÃ©">
          {canSeeAll && <option value="">Agenda de l'entreprise</option>}
          <option value="mine">Mes rendez-vous</option>
          {canSeeAll && <option value="unassigned">Non attribuÃ©s</option>}
          {canSeeAll && members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}
        </select>
        <div className="flex gap-1 bg-slate-100 rounded-full p-1">
          <button onClick={() => setView("list")} data-testid="view-list" title="Liste" className={`px-3 py-1.5 rounded-full ${view === "list" ? "bg-white shadow-sm" : "text-slate-500"}`}><LayoutList className="w-4 h-4" /></button>
          <button onClick={() => setView("week")} data-testid="view-week" title="Semaine" className={`px-3 py-1.5 rounded-full ${view === "week" ? "bg-white shadow-sm" : "text-slate-500"}`}><CalendarDays className="w-4 h-4" /></button>
          <button onClick={() => setView("month")} data-testid="view-month" title="Mois" className={`px-3 py-1.5 rounded-full ${view === "month" ? "bg-white shadow-sm" : "text-slate-500"}`}><CalendarRange className="w-4 h-4" /></button>
        </div>
      </div>

      {view !== "list" && (
        <CalendarView appointments={list} clientMap={clientMap} view={view} cursor={cursor} setCursor={setCursor} />
      )}

      {view === "list" && (shown.length === 0 ? (
        <div className="text-slate-400 text-sm py-16 text-center">Aucun rendez-vous.</div>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => {
            const cl = clientMap[r.client_id];
            const gc = genderClasses(cl?.gender);
            return (
              <li key={r.id}>
                <Link to={`/rdv/${r.id}`} data-testid={`rdv-item-${r.id}`} className={`flex items-center gap-4 p-5 ${gc.bg} border-2 ${gc.border} rounded-2xl hover:shadow-premium transition-all`}>
                  {r.status === "done" ? <CheckCircle2 className="w-5 h-5 text-[#166534]" /> : r.status === "cancelled" ? <Circle className="w-5 h-5 text-[#991B1B]" /> : <Circle className={`w-5 h-5 ${cl?.gender === "F" ? "text-pink-500" : cl?.gender === "H" ? "text-blue-500" : "text-[#1E3A8A]"}`} />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium">
                        {genderLabel(cl?.gender) && <span className="text-slate-500 text-xs mr-1">{genderLabel(cl?.gender)}</span>}
                        {r.client_name}
                      </div>
                      {r.family_pack_applied && <span className="text-[9px] tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#D4AF37]/10 text-[#C5A059] border border-[#D4AF37]/30">Pack Famille</span>}
                      {r.gift_applied && <span className="text-[9px] tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#D4AF37]/10 text-[#C5A059] border border-[#D4AF37]/30">GratuitÃ©</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{fmtDate(r.date)} Â· {fmtTime(r.date)} Â· {r.services.map(s => s.name).join(", ") || "â€”"}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-serif text-xl">{money(r.price_final)}</div>
                    <div className="text-[10px] tracking-wider uppercase text-slate-400">{r.payment_mode || "â€”"}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}
