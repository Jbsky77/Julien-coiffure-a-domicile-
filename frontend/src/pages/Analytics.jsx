import React, { useEffect, useState } from "react";
import { api, money, money2 } from "@/lib/api";
import { Link } from "react-router-dom";
import { Crown, Scissors, TrendingUp, Calendar, Users, Timer } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie } from "recharts";

export default function Analytics() {
  const [d, setD] = useState(null);
  useEffect(() => { (async () => { const r = await api.get("/analytics"); setD(r.data); })(); }, []);
  if (!d) return <div className="text-slate-500 text-sm">Chargement…</div>;

  return (
    <div className="space-y-6" data-testid="analytics-page">
      <div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Analytique</div>
        <h1 className="font-serif text-3xl tracking-tight">Statistiques</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white border border-[#D4AF37]/30 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">CA total</div><div className="font-serif text-xl mt-1 text-[#C5A059]">{money2(d.total_ca)} €</div></div>
        <div className="bg-white border border-blue-100 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">RDV</div><div className="font-serif text-xl mt-1 text-blue-600">{d.total_rdv}</div></div>
        <div className="bg-white border border-pink-100 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">Clients</div><div className="font-serif text-xl mt-1 text-pink-600">{d.total_clients}</div></div>
        <div className="bg-white border border-green-100 rounded-2xl p-4" data-testid="avg-age-stat"><div className="text-[10px] uppercase tracking-widest text-slate-500">Âge moyen</div><div className="font-serif text-xl mt-1 text-green-700">{d.average_age != null ? `${d.average_age} ans` : "—"}</div></div>
        <div className="bg-white border border-purple-100 rounded-2xl p-4" data-testid="avg-duration-stat"><div className="text-[10px] uppercase tracking-widest text-slate-500">Durée moy.</div><div className="font-serif text-xl mt-1 text-purple-600">{d.average_duration_minutes != null ? `${d.average_duration_minutes} min` : "—"}</div><div className="text-[9px] text-slate-500 mt-0.5">Total : {d.total_duration_minutes || 0} min</div></div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5" data-testid="gender-stats">
        <div className="flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-[#D4AF37]" /><div className="text-[10px] uppercase tracking-widest text-slate-500">Répartition Hommes / Femmes</div></div>
        <div className="grid grid-cols-3 gap-3">
          {d.gender_stats.map((g) => {
            const color = g.gender === "H" ? "#3B82F6" : g.gender === "F" ? "#EC4899" : "#94A3B8";
            const bg = g.gender === "H" ? "bg-blue-50" : g.gender === "F" ? "bg-pink-50" : "bg-slate-50";
            return (
              <div key={g.gender} className={`${bg} rounded-2xl p-4`} data-testid={`gender-${g.gender}`}>
                <div className="text-[10px] uppercase tracking-widest text-slate-600">{g.label}</div>
                <div className="font-serif text-2xl mt-1" style={{ color }}>{g.count}</div>
                <div className="text-xs text-slate-500 mt-1">{money2(g.revenue)} € de CA</div>
              </div>
            );
          })}
        </div>
        {d.gender_stats.some((g) => g.count > 0) && (
          <div className="h-40 mt-4">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={d.gender_stats.filter((g) => g.count > 0)} dataKey="count" nameKey="label" innerRadius={40} outerRadius={70}>
                  {d.gender_stats.filter((g) => g.count > 0).map((g, i) => <Cell key={i} fill={g.gender === "H" ? "#3B82F6" : g.gender === "F" ? "#EC4899" : "#94A3B8"} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5" data-testid="age-stats">
        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-3">Répartition par âge</div>
        <div className="h-48">
          <ResponsiveContainer>
            <BarChart data={d.age_stats} margin={{ top: 10, left: -10, right: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="range" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#0A192F" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5" data-testid="seasonal-chart">
        <div className="flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-[#D4AF37]" /><div className="text-[10px] uppercase tracking-widest text-slate-500">CA par mois · année en cours</div></div>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={d.seasonal} margin={{ top: 10, left: -10, right: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Bar dataKey="ca" radius={[6, 6, 0, 0]}>
                {d.seasonal.map((_, i) => <Cell key={i} fill={i % 2 ? "#0A192F" : "#1E3A8A"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5" data-testid="weekdays-chart">
        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-3">Meilleurs jours de la semaine</div>
        <div className="h-48">
          <ResponsiveContainer>
            <BarChart data={d.weekdays} margin={{ top: 10, left: -10, right: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Bar dataKey="ca" radius={[6, 6, 0, 0]} fill="#D4AF37" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3"><Scissors className="w-4 h-4 text-[#D4AF37]" /><div className="text-[10px] uppercase tracking-widest text-slate-500">Top prestations</div></div>
        <ul className="divide-y divide-slate-100">
          {d.top_services.slice(0, 8).map((s, i) => (
            <li key={s.service_id} className="flex items-center gap-3 py-2.5" data-testid={`top-svc-${i}`}>
              <span className="w-6 text-xs font-medium text-slate-400">#{i + 1}</span>
              <div className="flex-1 min-w-0"><div className="truncate text-sm font-medium">{s.name}</div><div className="text-xs text-slate-500">{s.count} × effectuée</div></div>
              <div className="font-serif text-base">{money2(s.revenue)} €</div>
            </li>
          ))}
          {d.top_services.length === 0 && <li className="text-slate-400 text-sm py-3">Pas encore de données.</li>}
        </ul>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5" data-testid="service-time-stats">
        <div className="flex items-center gap-2 mb-3"><Timer className="w-4 h-4 text-[#D4AF37]" /><div className="text-[10px] uppercase tracking-widest text-slate-500">Temps moyen par prestation</div></div>
        <ul className="divide-y divide-slate-100">
          {(d.service_time_stats || []).map((s, i) => (
            <li key={s.service_id} className="flex items-center gap-3 py-2.5" data-testid={`time-svc-${i}`}>
              <div className="flex-1 min-w-0"><div className="truncate text-sm font-medium">{s.name}</div><div className="text-xs text-slate-500">basé sur {s.count} RDV chronométré{s.count > 1 ? "s" : ""}</div></div>
              <div className="font-serif text-base text-purple-600">{s.avg_minutes} min</div>
            </li>
          ))}
          {(d.service_time_stats || []).length === 0 && <li className="text-slate-400 text-sm py-3">Aucune durée enregistrée pour le moment — utilisez le chronomètre sur vos RDV.</li>}
        </ul>
        {d.average_duration_minutes != null && (
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">Temps moyen global : <span className="font-semibold text-[#0A192F]">{d.average_duration_minutes} min</span> par rendez-vous</div>
        )}
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3"><Crown className="w-4 h-4 text-[#D4AF37]" /><div className="text-[10px] uppercase tracking-widest text-slate-500">Top clients</div></div>
        <ul className="divide-y divide-slate-100">
          {d.top_clients.slice(0, 10).map((c, i) => (
            <li key={c.client_id} className="py-2.5" data-testid={`top-client-${i}`}>
              <Link to={`/clients/${c.client_id}`} className="flex items-center gap-3 hover:opacity-80">
                <span className="w-6 text-xs font-medium text-slate-400">#{i + 1}</span>
                <div className="flex-1 min-w-0"><div className="truncate text-sm font-medium">{c.client_name}</div><div className="text-xs text-slate-500">{c.count} RDV</div></div>
                <div className="font-serif text-base">{money2(c.revenue)} €</div>
              </Link>
            </li>
          ))}
          {d.top_clients.length === 0 && <li className="text-slate-400 text-sm py-3">Pas encore de données.</li>}
        </ul>
      </div>
    </div>
  );
}
