import React, { useCallback, useEffect, useState } from "react";
import {
  Building2,
  CalendarDays,
  CreditCard,
  ExternalLink,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const STATUS_LABELS = {
  free: "Gratuit",
  trialing: "Essai",
  active: "Actif",
  past_due: "Paiement en retard",
  unpaid: "Impayé",
  canceled: "Résilié",
  suspended: "Suspendu",
  incomplete: "À configurer",
};

const STATUS_STYLES = {
  free: "bg-emerald-50 text-emerald-700",
  trialing: "bg-blue-50 text-blue-700",
  active: "bg-emerald-50 text-emerald-700",
  past_due: "bg-amber-50 text-amber-800",
  unpaid: "bg-red-50 text-red-700",
  canceled: "bg-slate-100 text-slate-600",
  suspended: "bg-red-50 text-red-700",
  incomplete: "bg-slate-100 text-slate-600",
};

const CYCLE_LABELS = { free: "Gratuit", monthly: "Mensuel", annual: "Annuel" };

function Metric({ icon: Icon, label, value, tone = "navy" }) {
  const tones = {
    navy: "bg-[#0A192F] text-white",
    gold: "bg-[#D4AF37]/15 text-[#785B16]",
    blue: "bg-blue-50 text-blue-800",
    green: "bg-emerald-50 text-emerald-800",
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${tones[tone]}`}><Icon className="w-5 h-5" /></div>
      <div className="text-3xl font-semibold tracking-tight">{value ?? 0}</div>
      <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">{label}</div>
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

  const changed = (
    form.plan_code !== (company.subscription?.plan_code || "starter")
    || form.billing_cycle !== (company.subscription?.billing_cycle || "monthly")
    || form.status !== (company.subscription?.status || "incomplete")
  );

  return (
    <article className="bg-white border border-slate-100 rounded-3xl p-5 md:p-6 shadow-sm" data-testid={`admin-company-${company.id}`}>
      <div className="flex items-start gap-4">
        {company.logo_url ? (
          <img src={company.logo_url} alt="" className="w-14 h-14 rounded-2xl object-contain border border-slate-100 flex-shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-6 h-6 text-slate-500" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-2xl truncate">{company.name}</h2>
            <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full ${STATUS_STYLES[form.status] || STATUS_STYLES.incomplete}`}>
              {STATUS_LABELS[form.status] || form.status}
            </span>
          </div>
          <div className="text-sm text-slate-500 mt-1">{company.email || "E-mail non renseigné"}</div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 mt-3">
            <span>SIRET : {company.siret || "À compléter"}</span>
            <span>{company.user_count} utilisateur{company.user_count > 1 ? "s" : ""}</span>
            <span>{company.employee_count} employé{company.employee_count > 1 ? "s" : ""}</span>
            <span>Inscrite le {new Date(company.created_at).toLocaleDateString("fr-FR")}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
        <label className="text-xs text-slate-500">
          Forfait
          <select value={form.plan_code} onChange={(event) => setForm({ ...form, plan_code: event.target.value })} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-800">
            <option value="founder_free">Fondateur gratuit</option>
            <option value="starter">Essentiel</option>
            <option value="professional">Professionnel</option>
            <option value="premium">Premium</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Facturation
          <select value={form.billing_cycle} onChange={(event) => setForm({ ...form, billing_cycle: event.target.value })} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-800">
            <option value="free">Gratuit</option>
            <option value="monthly">Mensuel</option>
            <option value="annual">Annuel</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          État
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-800">
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-5">
        <button type="button" onClick={() => onOpen(company)} className="flex-1 bg-[#0A192F] text-white rounded-full px-5 py-3 font-medium flex items-center justify-center gap-2">
          <ExternalLink className="w-4 h-4" /> Ouvrir cette entreprise
        </button>
        <button type="button" disabled={!changed || saving} onClick={() => onSave(company, form)} className="flex-1 border border-slate-200 rounded-full px-5 py-3 font-medium disabled:opacity-40">
          {saving ? "Enregistrement…" : "Enregistrer l’abonnement"}
        </button>
      </div>
    </article>
  );
}

export default function AdminDashboard() {
  const { user, logout, setActiveCompanyId } = useAuth();
  const [overview, setOverview] = useState({ stats: {}, companies: [] });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/platform-admin/overview");
      setOverview(response.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossible de charger le pilotage plateforme");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCompany = async (company) => {
    try {
      await api.post(`/platform-admin/companies/${company.id}/impersonate`);
      setActiveCompanyId(company.id);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossible d’ouvrir cette entreprise");
    }
  };

  const saveSubscription = async (company, form) => {
    setSavingId(company.id);
    try {
      await api.patch(`/platform-admin/companies/${company.id}/subscription`, form);
      toast.success("Abonnement mis à jour");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Impossible de mettre à jour l’abonnement");
    } finally {
      setSavingId(null);
    }
  };

  const stats = overview.stats || {};
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#0A192F] text-white">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-6 flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center"><ShieldCheck className="w-6 h-6 text-[#D4AF37]" /></div>
          <div className="flex-1">
            <div className="font-serif text-2xl">Pilotage plateforme</div>
            <div className="text-xs text-white/60">Entreprises, utilisateurs et abonnements</div>
          </div>
          <div className="hidden md:block text-right mr-2">
            <div className="text-sm">{user?.email}</div>
            <div className="text-[10px] uppercase tracking-widest text-white/50">Super-administrateur</div>
          </div>
          <button type="button" onClick={logout} className="p-3 rounded-full hover:bg-white/10" aria-label="Se déconnecter"><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 md:px-8 py-8">
        <div className="flex items-end gap-4 mb-7">
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500 mb-2">Vue d’ensemble</div>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight">Vos entreprises</h1>
          </div>
          <button type="button" onClick={load} disabled={loading} className="border border-slate-200 bg-white rounded-full px-4 py-2.5 flex items-center gap-2 text-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </button>
        </div>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
          <Metric icon={Building2} label="Entreprises" value={stats.companies_total} />
          <Metric icon={Users} label="Utilisateurs" value={stats.users_total} tone="blue" />
          <Metric icon={WalletCards} label="Abonnements payants" value={(stats.subscriptions_monthly || 0) + (stats.subscriptions_annual || 0)} tone="gold" />
          <Metric icon={ShieldCheck} label="Comptes gratuits" value={stats.subscriptions_free} tone="green" />
          <Metric icon={CreditCard} label="Mensuels" value={stats.subscriptions_monthly} tone="blue" />
          <Metric icon={CalendarDays} label="Annuels" value={stats.subscriptions_annual} tone="gold" />
          <Metric icon={ShieldCheck} label="Entreprises actives" value={stats.companies_active} tone="green" />
          <Metric icon={CreditCard} label="À régulariser" value={stats.companies_blocked} />
        </section>

        <div className="space-y-4">
          {loading && !overview.companies.length && <div className="bg-white rounded-2xl p-8 text-center text-slate-500">Chargement des entreprises…</div>}
          {!loading && !overview.companies.length && <div className="bg-white rounded-2xl p-8 text-center text-slate-500">Aucune entreprise inscrite.</div>}
          {overview.companies.map((company) => (
            <CompanyCard key={company.id} company={company} onOpen={openCompany} onSave={saveSubscription} saving={savingId === company.id} />
          ))}
        </div>
      </main>
    </div>
  );
}
