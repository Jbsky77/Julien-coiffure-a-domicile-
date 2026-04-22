import React, { useEffect, useState } from "react";
import { api, money, fmtDate, fmtTime } from "@/lib/api";
import { Link, useNavigate } from "react-router-dom";
import { CalendarClock, Plus, CheckCircle2, Circle, LayoutList, CalendarDays, CalendarRange } from "lucide-react";
import CalendarView from "@/components/app/CalendarView";

export default function Appointments() {
  const [list, setList] = useState([]);
  const [tab, setTab] = useState("upcoming");
  const [view, setView] = useState("list"); // list | week | month
  const [cursor, setCursor] = useState(new Date());
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const r = await api.get("/appointments");
      setList(r.data);
    })();
  }, []);

  const now = new Date();
  const upcoming = list.filter((r) => r.status === "scheduled");
  const done = list.filter((r) => r.status === "done");
  const shown = tab === "upcoming" ? upcoming : done;

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
        <button onClick={() => setTab("upcoming")} data-testid="tab-upcoming" className={`px-4 py-2 rounded-full text-sm ${tab === "upcoming" ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>À venir ({upcoming.length})</button>
        <button onClick={() => setTab("done")} data-testid="tab-done" className={`px-4 py-2 rounded-full text-sm ${tab === "done" ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>Historique ({done.length})</button>
        <div className="flex-1" />
        <div className="flex gap-1 bg-slate-100 rounded-full p-1">
          <button onClick={() => setView("list")} data-testid="view-list" title="Liste" className={`px-3 py-1.5 rounded-full ${view === "list" ? "bg-white shadow-sm" : "text-slate-500"}`}><LayoutList className="w-4 h-4" /></button>
          <button onClick={() => setView("week")} data-testid="view-week" title="Semaine" className={`px-3 py-1.5 rounded-full ${view === "week" ? "bg-white shadow-sm" : "text-slate-500"}`}><CalendarDays className="w-4 h-4" /></button>
          <button onClick={() => setView("month")} data-testid="view-month" title="Mois" className={`px-3 py-1.5 rounded-full ${view === "month" ? "bg-white shadow-sm" : "text-slate-500"}`}><CalendarRange className="w-4 h-4" /></button>
        </div>
      </div>

      {view !== "list" && (
        <CalendarView appointments={list} view={view} cursor={cursor} setCursor={setCursor} />
      )}

      {view === "list" && (shown.length === 0 ? (
        <div className="text-slate-400 text-sm py-16 text-center">Aucun rendez-vous.</div>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <li key={r.id}>
              <Link to={`/rdv/${r.id}`} data-testid={`rdv-item-${r.id}`} className="flex items-center gap-4 p-5 bg-white border border-slate-100 rounded-2xl hover:shadow-premium transition-all">
                {r.status === "done" ? <CheckCircle2 className="w-5 h-5 text-[#166534]" /> : <Circle className="w-5 h-5 text-[#1E3A8A]" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium">{r.client_name}</div>
                    {r.family_pack_applied && <span className="text-[9px] tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#D4AF37]/10 text-[#C5A059] border border-[#D4AF37]/30">Pack Famille</span>}
                    {r.gift_applied && <span className="text-[9px] tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#D4AF37]/10 text-[#C5A059] border border-[#D4AF37]/30">Gratuité</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{fmtDate(r.date)} · {fmtTime(r.date)} · {r.services.map(s => s.name).join(", ") || "—"}</div>
                </div>
                <div className="text-right">
                  <div className="font-serif text-xl">{money(r.price_final)}</div>
                  <div className="text-[10px] tracking-wider uppercase text-slate-400">{r.payment_mode || "—"}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
