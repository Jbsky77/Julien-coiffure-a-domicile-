import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, CalendarDays, CreditCard, Euro, ExternalLink, Filter,
  LogOut, MapPin, RefreshCw, Scissors, ShieldCheck, TrendingUp, Users,
  WalletCards,
} from "lucide-react";
import { MapContainer, CircleMarker, Popup, TileLayer } from "react-leaflet";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const STATUS_LABELS = {
  free: "Gratuit", trialing: "Essai", active: "Actif", past_due: "Paiement en retard",
  unpaid: "ImpayÃ©", canceled: "RÃ©siliÃ©", suspended: "Suspendu", incomplete: "Ã€ configurer",
};
const STATUS_STYLES = {
  free: "bg-emerald-50 text-emerald-700", trialing: "bg-blue-50 text-blue-700",
  active: "bg-emerald-50 text-emerald-700", past_due: "bg-amber-50 text-amber-800",
  unpaid: "bg-red-50 text-red-700", canceled: "bg-slate-100 text-slate-600",
  suspended: "bg-red-50 text-red-700", incomplete: "bg-slate-100 text-slate-600",
};
const PERIODS = [{ id: "30d", label: "30 jours" }, { id: "90d", label: "90 jours" }, { id: "year", label: "Cette annÃ©e" }, { id: "all", label: "Depuis le dÃ©but" }];
const TABS = [{ id: "activity", label: "ActivitÃ©", icon: TrendingUp }, { id: "map", label: "Carte", icon: MapPin }, { id: "companies", label: "Entreprises", icon: Building2 }];
const COLORS = ["#0A192F", "#D4AF37", "#2563EB", "#059669", "#7C3AED", "#EA580C"];
const euro = (value) => `${Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} â‚¬`;

function Metric({ icon: Icon, label, value, hint, tone = "navy" }) {
  const tones = { navy: "bg-[#0A192F] text-white", gold: "bg-[#D4AF37]/15 text-[#785B16]", blue: "bg-blue-50 text-blue-800", green: "bg-emerald-50 text-emerald-800" };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${tones[tone]}`}><Icon className="w-5 h-5" /></div>
      <div className="text-3xl font-semibold tracking-tight">{value ?? 0}</div>
      <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">{label}</div>
      {hint && <div className="text-xs text-slate-400 mt-2">{hint}</div>}
    </div>
  );
}

function CompanyCard({ company, onOpen, onSave, saving }) {
  const [form, setForm] = useState({
    plan_code: company.subscription?.plan_code || "starter",
    billing_cycle: company.subscription?.billing_cycle || "monthly",
    status: company.subscription?.status || "incomplete",
    current_period_end: company.subscription?.current_period_end || null,
    blocked_reason: company.subscription?.blocked_reason || null,
  });
  const changed = form.plan_code !== (company.subscription?.plan_code || "starter")
    || form.billing_cycle !== (company.subscription?.billing_cycle || "monthly")
    || form.status !== (company.subscription?.status || "incomplete");
  return (
    <article className="bg-white border border-slate-100 rounded-3xl p-5 md:p-6 shadow-sm" data-testid={`admin-company-${company.id}`}>
      <div className="flex items-start gap-4">
        {company.logo_url ? <img src={company.logo_url} alt="" className="w-14 h-14 rounded-2xl object-contain border border-slate-100 flex-shrink-0" /> : <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0"><Building2 className="w-6 h-6 text-slate-500" /></div>}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-serif text-2xl truncate">{company.name}</h2><span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full ${STATUS_STYLES[form.status] || STATUS_STYLES.incomplete}`}>{STATUS_LABELS[form.status] || form.status}</span></div>
          <div className="text-sm text-slate-500 mt-1">{company.email || "E-mail non renseignÃ©"}</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 mt-3"><span>SIRET : {company.siret || "Ã€ complÃ©ter"}</span><span>{company.user_count} utilisateur{company.user_count > 1 ? "s" : ""}</span><span>{company.employee_count} employÃ©{company.employee_count > 1 ? "s" : ""}</span><span>Inscrite le {new Date(company.created_at).toLocaleDateString("fr-FR")}</span></div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
        <label className="text-xs text-slate-500">Forfait<select value={form.plan_code} onChange={(e) => setForm({ ...form, plan_code: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-800"><option value="founder_free">Fondateur gratuit</option><option value="starter">Essentiel</option><option value="professional">Professionnel</option><option value="premium">Premium</option></select></label>
        <label className="text-xs text-slate-500">Facturation<select value={form.billing_cycle} onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-800"><option value="free">Gratuit</option><option value="monthly">Mensuel</option><option value="quarterly">Trimestriel</option><option value="annual">Annuel</option></select></label>
        <label className="text-xs text-slate-500">Ã‰tat<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-800">{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mt-5">
        <button type="button" onClick={() => onOpen(company)} className="flex-1 bg-[#0A192F] text-white rounded-full px-5 py-3 font-medium flex items-center justify-center gap-2"><ExternalLink className="w-4 h-4" /> Ouvrir cette entreprise</button>
        <button type="button" disabled={!changed || saving} onClick={() => onSave(company, form)} className="flex-1 border border-slate-200 rounded-full px-5 py-3 font-medium disabled:opacity-40">{saving ? "Enregistrementâ€¦" : "Enregistrer lâ€™abonnement"}</button>
      </div>
    </article>
  );
}

function ActivityView({ data }) {
  const totals = data.totals || {};
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Metric icon={Euro} label="Chiffre dâ€™affaires" value={euro(totals.revenue)} tone="gold" />
        <Metric icon={CalendarDays} label="Rendez-vous" value={totals.appointments || 0} hint={`${totals.completed || 0} terminÃ©s`} />
        <Metric icon={Users} label="Clients" value={totals.clients_total || 0} hint={`${totals.new_clients || 0} nouveaux`} tone="blue" />
        <Metric icon={Scissors} label="EmployÃ©s" value={totals.employees || 0} tone="green" />
        <Metric icon={WalletCards} label="Panier moyen" value={euro(totals.average_basket)} tone="gold" />
        <Metric icon={TrendingUp} label="Taux dâ€™annulation" value={`${totals.cancellation_rate || 0} %`} />
      </section>
      <section className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500 mb-4">Ã‰volution de lâ€™activitÃ©</div>
          <div className="h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.trend || []}><defs><linearGradient id="caFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D4AF37" stopOpacity={0.45}/><stop offset="100%" stopColor="#D4AF37" stopOpacity={0.03}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0"/><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(value, name) => name === "revenue" ? [euro(value), "CA"] : [value, "RDV"]}/><Area type="monotone" dataKey="revenue" stroke="#D4AF37" fill="url(#caFill)" strokeWidth={3}/></AreaChart></ResponsiveContainer></div>
        </div>
        <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
          <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500 mb-4">Prestations les plus vendues</div>
          <div className="space-y-3">{(data.top_services || []).map((service, index) => <div key={service.name} className="flex items-center gap-3"><span className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold">{index + 1}</span><div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{service.name}</div><div className="text-xs text-slate-400">{service.count} vente{service.count > 1 ? "s" : ""}</div></div><div className="text-sm font-semibold">{euro(service.revenue)}</div></div>)}{!(data.top_services || []).length && <div className="text-sm text-slate-400">Aucune prestation sur cette pÃ©riode.</div>}</div>
        </div>
      </section>
      <section className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
        <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500 mb-4">Classement des entreprises</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b"><th className="pb-3">#</th><th className="pb-3">Entreprise</th><th className="pb-3 text-right">CA</th><th className="pb-3 text-right">RDV</th><th className="pb-3 text-right">Clients</th><th className="pb-3 text-right">Panier</th><th className="pb-3 text-right">Annulation</th></tr></thead><tbody>{(data.ranking || []).map((company, index) => <tr key={company.company_id} className="border-b border-slate-50"><td className="py-4 font-serif text-lg text-[#D4AF37]">{index + 1}</td><td className="py-4 font-medium">{company.company_name}</td><td className="py-4 text-right font-semibold">{euro(company.revenue)}</td><td className="py-4 text-right">{company.appointments}</td><td className="py-4 text-right">{company.clients_total}</td><td className="py-4 text-right">{euro(company.average_basket)}</td><td className="py-4 text-right">{company.cancellation_rate} %</td></tr>)}</tbody></table></div>
      </section>
      <section className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
        <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500 mb-4">CA par entreprise</div>
        <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={(data.ranking || []).slice(0, 10)}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="company_name" tick={{ fontSize: 10 }} interval={0}/><YAxis tick={{ fontSize: 11 }}/><Tooltip formatter={(value) => euro(value)}/><Bar dataKey="revenue" fill="#0A192F" radius={[8, 8, 0, 0]}/></BarChart></ResponsiveContainer></div>
      </section>
    </div>
  );
}

function AdminMap({ data }) {
  const points = useMemo(() => data.map?.points || [], [data.map?.points]);
  const center = useMemo(() => points.length ? [points.reduce((sum, p) => sum + p.lat, 0) / points.length, points.reduce((sum, p) => sum + p.lng, 0) / points.length] : [46.6, 2.4], [points]);
  const companies = [...new Set(points.map((p) => p.company_id))];
  const colors = Object.fromEntries(companies.map((id, index) => [id, COLORS[index % COLORS.length]]));
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-wrap items-center gap-4"><div><div className="text-2xl font-semibold">{data.map?.located_clients || 0}</div><div className="text-xs uppercase tracking-wider text-slate-500">Clients localisÃ©s</div></div><div className="h-10 w-px bg-slate-100"/><div className="flex flex-wrap gap-2">{companies.map((id) => { const p = points.find((item) => item.company_id === id); return <span key={id} className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-slate-50"><span className="w-2.5 h-2.5 rounded-full" style={{ background: colors[id] }}/>{p?.company_name}</span>; })}</div></div>
      <div className="rounded-3xl overflow-hidden border border-slate-100 shadow-sm" style={{ height: "68vh", minHeight: 480 }}>
        <MapContainer key={center.join(",")} center={center} zoom={points.length ? 8 : 6} style={{ height: "100%", width: "100%" }} scrollWheelZoom><TileLayer attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{points.map((point) => <CircleMarker key={`${point.company_id}-${point.id}`} center={[point.lat, point.lng]} radius={8} pathOptions={{ color: "#fff", weight: 2, fillColor: colors[point.company_id], fillOpacity: 0.9 }}><Popup><div className="min-w-[180px]"><div className="font-medium">{point.label}</div><div className="text-xs text-slate-500 mt-1">{point.company_name}</div>{point.address && <div className="text-xs text-slate-400 mt-1">{point.address}</div>}</div></Popup></CircleMarker>)}</MapContainer>
      </div>
      <div className="text-xs text-slate-400">La carte affiche uniquement les clients dont les coordonnÃ©es gÃ©ographiques sont disponibles. Les couleurs distinguent les entreprises sÃ©lectionnÃ©es.</div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user, logout, setActiveCompanyId } = useAuth();
  const [overview, setOverview] = useState({ stats: {}, companies: [] });
  const [analytics, setAnalytics] = useState({ totals: {}, ranking: [], trend: [], top_services: [], map: { points: [] } });
  const [tab, setTab] = useState("activity");
  const [period, setPeriod] = useState("30d");
  const [selectedCompanies, setSelectedCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const loadOverview = useCallback(async () => { const response = await api.get("/platform-admin/overview"); setOverview(response.data); }, []);
  const loadAnalytics = useCallback(async () => { const params = { period }; if (selectedCompanies.length) params.company_ids = selectedCompanies.join(","); const response = await api.get("/platform-admin/analytics", { params }); setAnalytics(response.data); }, [period, selectedCompanies]);
  const load = useCallback(async () => { setLoading(true); try { await Promise.all([loadOverview(), loadAnalytics()]); } catch (error) { toast.error(error.response?.data?.detail || "Impossible de charger le pilotage plateforme"); } finally { setLoading(false); } }, [loadOverview, loadAnalytics]);
  useEffect(() => { load(); }, [load]);

  const toggleCompany = (id) => setSelectedCompanies((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const openCompany = async (company) => { try { await api.post(`/platform-admin/companies/${company.id}/impersonate`); setActiveCompanyId(company.id); } catch (error) { toast.error(error.response?.data?.detail || "Impossible dâ€™ouvrir cette entreprise"); } };
  const saveSubscription = async (company, form) => { setSavingId(company.id); try { await api.patch(`/platform-admin/companies/${company.id}/subscription`, form); toast.success("Abonnement mis Ã  jour"); await loadOverview(); } catch (error) { toast.error(error.response?.data?.detail || "Impossible de mettre Ã  jour lâ€™abonnement"); } finally { setSavingId(null); } };
  const stats = overview.stats || {};

  return (
    <div className="min-h-screen bg-slate-50" data-testid="platform-admin-dashboard">
      <header className="bg-[#0A192F] text-white"><div className="max-w-7xl mx-auto px-5 md:px-8 py-6 flex items-center gap-4"><div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center"><ShieldCheck className="w-6 h-6 text-[#D4AF37]" /></div><div className="flex-1"><div className="font-serif text-2xl">Pilotage plateforme</div><div className="text-xs text-white/60">ActivitÃ©, entreprises et abonnements</div></div><div className="hidden md:block text-right mr-2"><div className="text-sm">{user?.email}</div><div className="text-[10px] uppercase tracking-widest text-white/50">Super-administrateur</div></div><button type="button" onClick={logout} className="p-3 rounded-full hover:bg-white/10" aria-label="Se dÃ©connecter"><LogOut className="w-5 h-5" /></button></div></header>
      <main className="max-w-7xl mx-auto px-5 md:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-end gap-4 mb-6"><div className="flex-1"><div className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-2">Vue dâ€™ensemble</div><h1 className="font-serif text-4xl md:text-5xl tracking-tight">Administration gÃ©nÃ©rale</h1></div><button type="button" onClick={load} disabled={loading} className="border border-slate-200 bg-white rounded-full px-4 py-2.5 flex items-center justify-center gap-2 text-sm"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Actualiser</button></div>
        <nav className="flex gap-2 bg-white rounded-full p-1 border border-slate-100 shadow-sm w-full md:w-fit mb-6">{TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex-1 md:flex-none rounded-full px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${tab === id ? "bg-[#0A192F] text-white" : "text-slate-500 hover:bg-slate-50"}`}><Icon className="w-4 h-4"/>{label}</button>)}</nav>
        {tab !== "companies" && <section className="bg-white rounded-2xl border border-slate-100 p-4 mb-6"><div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 mb-3"><Filter className="w-4 h-4"/> Filtres</div><div className="flex flex-col lg:flex-row gap-4"><div className="flex flex-wrap gap-2">{PERIODS.map((item) => <button key={item.id} type="button" onClick={() => setPeriod(item.id)} className={`rounded-full px-3 py-2 text-xs font-medium ${period === item.id ? "bg-[#0A192F] text-white" : "bg-slate-100 text-slate-600"}`}>{item.label}</button>)}</div><div className="lg:border-l lg:pl-4 flex flex-wrap gap-2"><button type="button" onClick={() => setSelectedCompanies([])} className={`rounded-full px-3 py-2 text-xs font-medium ${selectedCompanies.length === 0 ? "bg-[#D4AF37] text-white" : "bg-slate-100 text-slate-600"}`}>Toutes les entreprises</button>{overview.companies.map((company) => <button key={company.id} type="button" onClick={() => toggleCompany(company.id)} className={`rounded-full px-3 py-2 text-xs font-medium ${selectedCompanies.includes(company.id) ? "bg-[#0A192F] text-white" : "bg-slate-100 text-slate-600"}`}>{company.name}</button>)}</div></div></section>}
        {loading && !overview.companies.length ? <div className="bg-white rounded-2xl p-10 text-center text-slate-500">Chargement du pilotageâ€¦</div> : <>{tab === "activity" && <ActivityView data={analytics}/>} {tab === "map" && <AdminMap data={analytics}/>} {tab === "companies" && <div className="space-y-6"><section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4"><Metric icon={Building2} label="Entreprises" value={stats.companies_total}/><Metric icon={Users} label="Utilisateurs" value={stats.users_total} tone="blue"/><Metric icon={CreditCard} label="Abonnements payants" value={(stats.subscriptions_monthly || 0) + (stats.subscriptions_quarterly || 0) + (stats.subscriptions_annual || 0)} tone="gold"/><Metric icon={ShieldCheck} label="Ã€ rÃ©gulariser" value={stats.companies_blocked} tone="green"/></section><div className="space-y-4">{overview.companies.map((company) => <CompanyCard key={company.id} company={company} onOpen={openCompany} onSave={saveSubscription} saving={savingId === company.id}/>)}</div></div>}</>}
      </main>
    </div>
  );
}

