import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, money, fmtDate, fmtTime, fmtMonth, money2 } from "@/lib/api";
import { CalendarClock, Cake, Gift, Gauge, TrendingUp, Package, Users, Wallet, Bell, Plus, Navigation, Lightbulb, Target, AlertCircle, MessageSquare, Check, X, Eye } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const PIE_COLORS = ["#0A192F", "#1E3A8A", "#D4AF37", "#94A3B8", "#CBD5E1", "#64748B"];

function Widget({ title, children, actionLabel, onAction, tid, color }) {
  const colorMap = {
    blue: "bg-blue-50/50 border-blue-100",
    pink: "bg-pink-50/50 border-pink-100",
    gold: "bg-[#D4AF37]/5 border-[#D4AF37]/20",
    green: "bg-green-50/50 border-green-100",
    rose: "bg-rose-50/50 border-rose-100",
  };
  const cls = color ? colorMap[color] : "bg-white border-slate-100";
  return (
    <div className={`${cls} border rounded-2xl p-6 shadow-premium`} data-testid={tid}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] tracking-[0.25em] uppercase text-slate-500">{title}</div>
        {actionLabel && (
          <button onClick={onAction} className="text-xs text-[#1E3A8A] hover:underline" data-testid={`${tid}-action`}>
            {actionLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [months, setMonths] = useState([]);
  const [tour, setTour] = useState(null);
  const [goals, setGoals] = useState(null);
  const [insights, setInsights] = useState([]);
  const [atRisk, setAtRisk] = useState(0);
  const [pendingReqs, setPendingReqs] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [adminNotifs, setAdminNotifs] = useState([]);
  const navigate = useNavigate();

  const load = async () => {
    const [r, m, t, g, ins, st, reqs, rem, notifs] = await Promise.all([
      api.get("/dashboard"),
      api.get("/accounting/months"),
      api.get("/tour/today").catch(() => ({ data: null })),
      api.get("/goals/progress").catch(() => ({ data: null })),
      api.get("/insights").catch(() => ({ data: { insights: [] } })),
      api.get("/clients/status").catch(() => ({ data: [] })),
      api.get("/appointment-requests").catch(() => ({ data: [] })),
      api.get("/reminders/tomorrow").catch(() => ({ data: { reminders: [] } })),
      api.get("/notifications/admin").catch(() => ({ data: [] })),
    ]);
    setD(r.data);
    setMonths(m.data);
    setTour(t.data);
    setGoals(g.data);
    setInsights(ins.data?.insights || []);
    setAtRisk((st.data || []).filter((c) => ["a_relancer", "en_retard", "presque_perdu"].includes(c.status)).length);
    setPendingReqs((reqs.data || []).filter((r) => r.status === "pending" || r.status === "counter_proposed").slice(0, 4));
    setReminders(rem.data?.reminders || []);
    setAdminNotifs((notifs.data || []).slice(0, 8));
  };

  const dismissNotif = async (nid) => {
    setAdminNotifs((prev) => prev.filter((n) => n.id !== nid));
    try { await api.post(`/notifications/admin/${nid}/dismiss`); } catch (e) { console.warn("dismiss notification:", e); }
  };

  const markReminderSent = async (aid) => {
    try {
      await api.post(`/reminders/${aid}/sent`);
      setReminders((prev) => prev.map((r) => (r.appointment_id === aid ? { ...r, sent: true } : r)));
    } catch (e) {
      console.warn("mark reminder sent:", e);
    }
  };

  useEffect(() => { load(); }, []);

  // Install prompt (PWA)
  const [installEvt, setInstallEvt] = useState(null);
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  // Birthday notifications (weekly check)
  useEffect(() => {
    if (!d || !("Notification" in window)) return;
    const KEY = "jb_last_birthday_notif";
    const last = localStorage.getItem(KEY);
    const today = new Date().toDateString();
    if (last === today) return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
    if (Notification.permission === "granted" && d.upcoming_birthdays.length > 0) {
      const names = d.upcoming_birthdays.map((c) => `${c.first_name} ${c.last_name}`.trim()).join(", ");
      try {
        new Notification("🎂 Anniversaires à venir", { body: names, tag: "birthdays" });
        localStorage.setItem(KEY, today);
      } catch (e) {
        console.warn("birthday notification:", e);
      }
    }
  }, [d]);

  if (!d) return <div className="text-slate-500">Chargement…</div>;

  const md = d.month_data;
  const stockPie = d.stock_items.map((s) => ({ name: s.name, value: Math.max(s.quantity, 0.01) }));
  const paymentsArray = Object.entries(md.payment_breakdown || {}).map(([k, v]) => ({ mode: k, ...v }));

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      {installEvt && (
        <div className="bg-[#0A192F] text-white rounded-2xl p-4 flex items-center justify-between gap-4" data-testid="install-banner">
          <div className="text-sm">Installez l'application sur votre écran d'accueil pour un accès rapide.</div>
          <div className="flex gap-2">
            <button onClick={async () => { installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); }} data-testid="install-btn" className="bg-gold-gradient text-white rounded-full px-4 py-2 text-sm">Installer</button>
            <button onClick={() => setInstallEvt(null)} className="text-white/60 text-sm">Plus tard</button>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Tableau de bord</div>
          <h1 className="font-serif text-3xl tracking-tight">Bonjour Julien.</h1>
          <div className="text-xs text-slate-500 mt-1">Activité de <span className="italic">{fmtMonth(d.month)}</span>.</div>
        </div>
        <button onClick={() => navigate("/rdv/nouveau")} data-testid="dashboard-new-rdv" className="bg-[#0A192F] text-white rounded-full px-5 py-2.5 text-xs font-medium hover:bg-[#1E3A8A] flex items-center gap-2 self-start">
          <Plus className="w-4 h-4" /> Nouveau RDV
        </button>
      </div>

      {/* Démarrer ma journée — hero CTA */}
      {tour && tour.stops.length > 0 && (
        <button
          onClick={() => navigate("/tour")}
          data-testid="start-day-cta"
          className="w-full text-left bg-[#0A192F] text-white rounded-3xl p-6 shadow-premium hover:bg-[#1E3A8A] transition-colors flex items-center justify-between gap-4"
        >
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-white/60 mb-2">Aujourd'hui</div>
            <div className="font-serif text-2xl">Démarrer ma journée</div>
            <div className="text-xs text-white/70 mt-1">
              {tour.stops.length} RDV · {money2(tour.total_ca)} € · {tour.total_travel_min} min de route
            </div>
          </div>
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gold-gradient flex items-center justify-center">
            <Navigation className="w-5 h-5 text-white" />
          </div>
        </button>
      )}

      {/* Top KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Widget title="Chiffre d'affaires" tid="kpi-ca" color="gold">
          <div className="font-serif text-xl text-[#C5A059]">{money2(md.ca_brut)} €</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{md.n_rdv} RDV</div>
        </Widget>
        <Widget title="Marge nette" tid="kpi-marge" actionLabel="Détails" onAction={() => navigate("/compta")} color="green">
          <div className={`font-serif text-xl ${md.marge_nette >= 0 ? "text-green-700" : "text-[#991B1B]"}`}>{money2(md.marge_nette)} €</div>
          <div className="text-[11px] text-slate-500 mt-0.5">après charges</div>
        </Widget>
        <Widget title="RDV à venir" tid="kpi-upcoming" actionLabel="Voir" onAction={() => navigate("/rdv")} color="blue">
          <div className="font-serif text-xl text-blue-600">{d.upcoming_count > 0 ? d.upcoming_count : "Aucun"}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{money(d.upcoming_amount)} prévus</div>
        </Widget>
        <Widget title="Panier moyen" tid="kpi-basket" color="pink">
          <div className="font-serif text-xl text-pink-600">{money2(d.avg_basket.month)} €</div>
          <div className="text-[11px] text-slate-500 mt-0.5">j {money2(d.avg_basket.day)}€ · an {money2(d.avg_basket.year)}€</div>
        </Widget>
      </div>

      {/* Objectifs du mois */}
      {goals && (
        <Widget title="Objectifs du mois" tid="widget-goals" actionLabel="Modifier" onAction={() => navigate("/reglages")} color="gold">
          <div className="grid grid-cols-2 gap-4">
            {[
              { k: "ca", label: "CA", suffix: "€", v: goals.ca },
              { k: "rdv", label: "RDV", suffix: "", v: goals.rdv },
              { k: "panier", label: "Panier moyen", suffix: "€", v: goals.panier },
              { k: "relances", label: "Relances", suffix: "", v: goals.relances },
            ].map((g) => (
              <div key={g.k} data-testid={`goal-${g.k}`}>
                <div className="flex items-baseline justify-between text-xs mb-1.5">
                  <span className="text-slate-500">{g.label}</span>
                  <span className="text-slate-700"><span className="font-medium">{money2(g.v.value)}</span>{g.suffix} <span className="text-slate-400">/ {money2(g.v.goal)}{g.suffix}</span></span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gold-gradient rounded-full transition-all" style={{ width: `${Math.min(100, g.v.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Widget>
      )}

      {/* Insights + At-risk clients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {insights.length > 0 && (
          <Widget title="Insights automatiques" tid="widget-insights">
            <ul className="space-y-2">
              {insights.map((txt, i) => (
                <li key={txt || i} className="flex items-start gap-2 text-sm text-slate-700">
                  <Lightbulb className="w-4 h-4 text-[#D4AF37] mt-0.5 flex-shrink-0" />
                  <span>{txt}</span>
                </li>
              ))}
            </ul>
          </Widget>
        )}
        {atRisk > 0 && (
          <Widget title="Clients à risque" tid="widget-atrisk" actionLabel="Voir tous" onAction={() => navigate("/clients-status")} color="rose">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-8 h-8 text-rose-500" />
              <div>
                <div className="font-serif text-3xl">{atRisk}</div>
                <div className="text-xs text-slate-500">à relancer / presque perdus</div>
              </div>
            </div>
          </Widget>
        )}
      </div>

      {/* Reminders: SMS 24h before tomorrow's appointments */}
      {reminders.length > 0 && (
        <Widget title="Rappels SMS — RDV de demain" tid="widget-reminders" color="blue">
          <ul className="space-y-2.5">
            {reminders.map((r) => (
              <li key={r.appointment_id} className="flex items-center justify-between gap-3" data-testid={`reminder-${r.appointment_id}`}>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.client_name}</div>
                  <div className="text-xs text-slate-500 truncate">{r.time}{r.services ? ` · ${r.services}` : ""}</div>
                </div>
                {r.sent ? (
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-green-100 text-green-700 flex items-center gap-1 whitespace-nowrap" data-testid={`reminder-sent-${r.appointment_id}`}><Check className="w-3 h-3" /> Envoyé</span>
                ) : r.phone ? (
                  <a
                    href={`sms:${r.phone.replace(/\s/g, "")}?body=${encodeURIComponent(r.message)}`}
                    onClick={() => markReminderSent(r.appointment_id)}
                    data-testid={`reminder-sms-${r.appointment_id}`}
                    className="text-xs px-3.5 py-1.5 rounded-full bg-[#0A192F] text-white flex items-center gap-1.5 whitespace-nowrap hover:bg-[#1E3A8A]"
                  >
                    <MessageSquare className="w-3 h-3" /> Envoyer le rappel
                  </a>
                ) : (
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 whitespace-nowrap">Pas de téléphone</span>
                )}
              </li>
            ))}
          </ul>
        </Widget>
      )}

      {/* Pending appointment requests widget */}
      {pendingReqs.length > 0 && (
        <Widget title="Demandes de RDV clients" tid="widget-pending-requests" actionLabel="Tout voir" onAction={() => navigate("/demandes")} color="gold">
          <ul className="space-y-2.5">
            {pendingReqs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3" data-testid={`dash-req-${r.id}`}>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.client_name}</div>
                  <div className="text-xs text-slate-500">
                    {fmtDate(r.status === "counter_proposed" ? r.counter_proposed_date : r.requested_date)}
                    · {r.services.map((s) => s.name).slice(0, 2).join(", ")}
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${r.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                  {r.status === "pending" ? "En attente" : "Contre-prop."}
                </span>
              </li>
            ))}
          </ul>
        </Widget>
      )}

      {/* Activité récente — admin notifications (portal visits, etc.) */}
      {adminNotifs.length > 0 && (
        <Widget title="Activité récente" tid="widget-admin-notifs" color="blue">
          <ul className="space-y-2">
            {adminNotifs.map((n) => {
              const isVisit = n.meta?.type === "portal_visit";
              const clientId = n.meta?.client_id;
              const when = n.created_at ? new Date(n.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
              return (
                <li
                  key={n.id}
                  className={`flex items-start justify-between gap-3 p-2.5 rounded-xl ${n.read ? "bg-white/60" : "bg-blue-50/70 border border-blue-100"}`}
                  data-testid={`admin-notif-${n.id}`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {isVisit ? <Eye className="w-4 h-4 text-[#1E3A8A] mt-0.5 flex-shrink-0" /> : <Bell className="w-4 h-4 text-[#D4AF37] mt-0.5 flex-shrink-0" />}
                    <div className="min-w-0">
                      {isVisit && clientId ? (
                        <Link to={`/clients/${clientId}`} className="text-sm text-[#0A192F] hover:underline block truncate">{n.message}</Link>
                      ) : (
                        <div className="text-sm text-slate-800 truncate">{n.message}</div>
                      )}
                      <div className="text-[10px] text-slate-400 mt-0.5">{when}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => dismissNotif(n.id)}
                    data-testid={`dismiss-notif-${n.id}`}
                    className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex-shrink-0"
                    title="Effacer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Widget>
      )}

      {/* Row: today / tomorrow / birthdays */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Widget title="Aujourd'hui" tid="widget-today">
          {d.upcoming_today.length === 0 ? <div className="text-slate-400 text-sm">Aucun RDV prévu.</div> : (
            <ul className="space-y-3">
              {d.upcoming_today.map((r) => (
                <li key={r.id}>
                  <Link to={`/rdv/${r.id}`} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50" data-testid={`today-rdv-${r.id}`}>
                    <CalendarClock className="w-4 h-4 text-[#1E3A8A] mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium">{r.client_name}</div>
                      <div className="text-xs text-slate-500">{fmtTime(r.date)} · {money(r.price_final)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget title="Demain" tid="widget-tomorrow">
          {d.upcoming_tomorrow.length === 0 ? <div className="text-slate-400 text-sm">Aucun RDV demain.</div> : (
            <ul className="space-y-3">
              {d.upcoming_tomorrow.map((r) => (
                <li key={r.id}>
                  <Link to={`/rdv/${r.id}`} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50">
                    <CalendarClock className="w-4 h-4 text-[#1E3A8A] mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium">{r.client_name}</div>
                      <div className="text-xs text-slate-500">{fmtTime(r.date)} · {money(r.price_final)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget title="Anniversaires (7 jours)" tid="widget-birthdays" color="pink">
          {d.upcoming_birthdays.length === 0 ? <div className="text-slate-400 text-sm">Aucun anniversaire imminent.</div> : (
            <ul className="space-y-3">
              {d.upcoming_birthdays.map((c) => (
                <li key={c.id}>
                  <Link to={`/clients/${c.id}`} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50">
                    <Cake className="w-4 h-4 text-[#D4AF37] mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium">{c.first_name} {c.last_name}</div>
                      <div className="text-xs text-slate-500">{c.days_until === 0 ? "Aujourd'hui 🎉" : `Dans ${c.days_until} jour(s)`}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Widget>
      </div>

      {/* Payments + Km + Gifts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Widget title="Règlements du mois" tid="widget-payments">
          {paymentsArray.length === 0 ? <div className="text-slate-400 text-sm">Aucun règlement ce mois.</div> : (
            <ul className="space-y-2">
              {paymentsArray.map((p) => (
                <li key={p.mode} className="flex items-center justify-between text-sm">
                  <span className="tracking-wide">{p.mode}</span>
                  <span className="text-slate-500">{p.count} · <span className="font-medium text-[#0A192F]">{money2(p.amount)} €</span></span>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget title="Kilomètres ce mois" tid="widget-km">
          <div className="font-serif text-3xl">{money2(md.total_km)} km</div>
          <div className="text-xs text-slate-500 mt-2 space-y-1">
            <div>Facturé clients : <span className="text-[#0A192F]">{money2(md.fuel_charged)} €</span></div>
            <div>Coût réel : <span className="text-[#0A192F]">{money2(md.fuel_real_cost)} €</span></div>
            <div>Balance : <span className={md.fuel_balance >= 0 ? "text-[#166534]" : "text-[#991B1B]"}>{md.fuel_balance >= 0 ? "+" : ""}{money2(md.fuel_balance)} €</span></div>
          </div>
        </Widget>

        <Widget title="Prestations offertes" tid="widget-gifts" color="gold">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-[#D4AF37]" />
            <div className="font-serif text-3xl">{d.gifts_month.count}</div>
          </div>
          <div className="text-xs text-slate-500 mt-2 space-y-1">
            <div>Aujourd'hui : {d.gifts_today.count} · {money2(d.gifts_today.value)} €</div>
            <div>Ce mois-ci (valeur) : <span className="text-[#0A192F]">{money2(d.gifts_month.value)} €</span></div>
          </div>
        </Widget>
      </div>

      {/* Stock + Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Widget title="Stock · Répartition" tid="widget-stock-pie" actionLabel="Gérer" onAction={() => navigate("/stock")}>
          {stockPie.length === 0 ? <div className="text-slate-400 text-sm">Aucun produit en stock.</div> : (
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={stockPie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {stockPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {d.low_stock.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {d.low_stock.map((s) => (
                <span key={s.id} className="text-[10px] tracking-wider uppercase px-3 py-1 rounded-full bg-red-50 text-[#991B1B] border border-red-100" data-testid={`low-stock-${s.id}`}>
                  <Bell className="w-3 h-3 inline mr-1" /> {s.name}
                </span>
              ))}
            </div>
          )}
        </Widget>

        <Widget title="Prévisionnel · Chiffre d'affaires" tid="widget-forecast">
          {months.length === 0 ? <div className="text-slate-400 text-sm">Pas encore de données historiques.</div> : (
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={months} margin={{ top: 10, left: 0, right: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0" }} />
                  <Line type="monotone" dataKey="ca" stroke="#0A192F" strokeWidth={2} dot={{ r: 4, fill: "#D4AF37" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Widget>
      </div>

      {/* Rentability detail */}
      <Widget title="Rentabilité du mois" tid="widget-rentability">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div><div className="text-xs text-slate-500">CA brut</div><div className="font-medium">{money2(md.ca_brut)} €</div></div>
          <div><div className="text-xs text-slate-500">URSSAF (22%)</div><div className="font-medium">-{md.urssaf_ceil} €</div></div>
          <div><div className="text-xs text-slate-500">Consommables</div><div className="font-medium">-{money2(md.consumables)} €</div></div>
          <div><div className="text-xs text-slate-500">Frais fixes</div><div className="font-medium">-{money2(md.fixed_costs)} €</div></div>
          <div><div className="text-xs text-slate-500">Carburant (balance)</div><div className={`font-medium ${md.fuel_balance >= 0 ? "text-[#166534]" : "text-[#991B1B]"}`}>{md.fuel_balance >= 0 ? "+" : ""}{money2(md.fuel_balance)} €</div></div>
        </div>
        <div className="divider my-4" />
        <div className="flex items-center justify-between">
          <div className="text-xs tracking-widest uppercase text-slate-500">Marge nette</div>
          <div className={`font-serif text-3xl ${md.marge_nette >= 0 ? "text-[#0A192F]" : "text-[#991B1B]"}`}>{money2(md.marge_nette)} €</div>
        </div>
      </Widget>

      {d.unseen_clients.length > 0 && (
        <Widget title={`Clients à relancer (> 30 jours)`} tid="widget-unseen">
          <div className="flex flex-wrap gap-2">
            {d.unseen_clients.slice(0, 20).map((c) => (
              <Link key={c.id} to={`/clients/${c.id}`} className="text-xs px-3 py-1.5 rounded-full border border-slate-200 hover:bg-slate-50">
                {c.first_name} {c.last_name} · {c.days_since}j
              </Link>
            ))}
          </div>
        </Widget>
      )}
    </div>
  );
}
