import React, { useEffect, useMemo, useState } from "react";
import { api, money, API } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Save, Copy, Calendar, Download, MapPin, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import EmployeeManagement from "@/components/settings/EmployeeManagement";
import CompanyProfile from "@/components/settings/CompanyProfile";

function BusinessAddressBlock({ settings, setSettings, onSave }) {
  const [checking, setChecking] = useState(false);
  const [recalcOpen, setRecalcOpen] = useState(false);
  const [recalcResult, setRecalcResult] = useState(null);
  const ba = settings.business_address || { address: "", lat: null, lng: null, geocode_status: "pending", verified_at: null };
  const geocode = async () => {
    setChecking(true);
    try {
      const r = await api.post("/geocode/business");
      setSettings((s) => ({ ...s, business_address: r.data.business_address }));
      if (r.data.ok) toast.success("Adresse professionnelle vérifiée");
      else toast.error("Adresse introuvable — vérifiez la saisie");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setChecking(false);
    }
  };
  const recalc = async () => {
    setRecalcOpen(false);
    try {
      const r = await api.post("/travel/recalc-future");
      setRecalcResult(r.data);
      toast.success(`${r.data.updated} rendez-vous futurs mis à jour`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };
  const badge = ba.geocode_status === "ok"
    ? <span className="inline-flex items-center gap-1 text-xs text-[#166534] bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"><CheckCircle2 className="w-3 h-3" /> Vérifiée</span>
    : <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><AlertTriangle className="w-3 h-3" /> Non vérifiée</span>;
  const fb = "w-full bg-transparent border-b border-slate-300 rounded-none px-0 py-2 focus:border-[#0A192F] focus:outline-none text-base";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <MapPin className="w-4 h-4 text-[#D4AF37]" />
        {badge}
        {ba.lat !== null && ba.lng !== null && (
          <span className="text-[10px] text-slate-500">lat {ba.lat.toFixed(5)}, lng {ba.lng.toFixed(5)}</span>
        )}
      </div>
      <input
        data-testid="business-address-input"
        value={ba.address}
        onChange={(e) => setSettings({ ...settings, business_address: { ...ba, address: e.target.value, geocode_status: "pending" } })}
        className={fb}
        placeholder="16 chemin de la Station Météo, 46300 Gourdon, France"
      />
      <div className="flex flex-wrap gap-2">
        <button onClick={async () => { await onSave(); await geocode(); }} disabled={checking} data-testid="verify-business-btn" className="rounded-full px-4 py-2 bg-[#0A192F] text-white text-sm flex items-center gap-2 disabled:opacity-50">
          <CheckCircle2 className="w-4 h-4" /> {checking ? "Vérification…" : "Enregistrer & vérifier"}
        </button>
        <button onClick={() => setRecalcOpen(true)} data-testid="recalc-future-btn" className="rounded-full px-4 py-2 border border-slate-200 text-sm">
          Recalculer les futurs RDV non encaissés
        </button>
      </div>
      {recalcOpen && (
        <div className="text-sm bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
          <div>Cette action met à jour la distance et le supplément théorique des RDV futurs non encaissés. Les RDV déjà payés ne sont jamais modifiés.</div>
          <div className="flex gap-2">
            <button onClick={recalc} data-testid="recalc-confirm" className="rounded-full px-4 py-2 bg-[#991B1B] text-white text-sm">Confirmer</button>
            <button onClick={() => setRecalcOpen(false)} className="rounded-full px-4 py-2 border border-slate-200 text-sm">Annuler</button>
          </div>
        </div>
      )}
      {recalcResult && (
        <div className="text-xs text-slate-500">{recalcResult.updated} RDV recalculés · {recalcResult.skipped_paid} déjà encaissés ignorés</div>
      )}
    </div>
  );
}

function IcalBlock() {
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/calendar/ical-url");
        setUrl(`${API}/calendar/${r.data.token}.ics`);
      } catch (e) {
        setErr(e.response?.data?.detail || "Impossible de générer l'URL");
      }
    })();
  }, []);
  const copy = async () => {
    if (!url) return toast.error("URL non disponible");
    await navigator.clipboard.writeText(url);
    toast.success("URL copiée dans le presse-papiers");
  };
  const rotate = async () => {
    if (!window.confirm("Régénérer l'URL ? L'ancien lien deviendra invalide.")) return;
    try {
      const r = await api.post("/calendar/ical-rotate");
      setUrl(`${API}/calendar/${r.data.token}.ics`);
      toast.success("Nouvelle URL générée");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input data-testid="ical-url" readOnly value={url || err || "Chargement…"} className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-full px-4 py-2 text-xs text-slate-600" />
      <button onClick={copy} disabled={!url} data-testid="ical-copy" className="rounded-full px-4 py-2 border border-slate-200 text-sm flex items-center gap-2 disabled:opacity-40"><Copy className="w-4 h-4" /> Copier</button>
      {url && <a href={url} download="calendrier-rendez-vous.ics" data-testid="ical-download" className="rounded-full px-4 py-2 bg-[#0A192F] text-white text-sm flex items-center gap-2"><Calendar className="w-4 h-4" /> Télécharger .ics</a>}
      {url && <button onClick={rotate} data-testid="ical-rotate" className="rounded-full px-4 py-2 border border-slate-200 text-sm text-slate-600">Régénérer</button>}
    </div>
  );
}

const SERVICE_CATEGORIES = [
  { id: "HOMME", label: "Hommes", color: "bg-blue-100 text-blue-700" },
  { id: "FEMME", label: "Femmes", color: "bg-pink-100 text-pink-700" },
  { id: "ENFANT", label: "Enfants", color: "bg-green-100 text-green-700" },
  { id: "FAMILLE", label: "Pack famille", color: "bg-amber-100 text-amber-800" },
];
const CATS = SERVICE_CATEGORIES.map((category) => category.id);
const serviceCategory = (service) => {
  const category = (service?.category || "").toUpperCase();
  if (CATS.includes(category)) return category;
  if (/famille|pack/i.test(service?.name || "")) return "FAMILLE";
  return "FAMILLE";
};
const THEMES = [
  { id: "VENTE_PRODUITS", label: "Vente de produits", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { id: "COLORATIONS", label: "Colorations", color: "bg-violet-100 text-violet-800 border-violet-200" },
  { id: "BALAYAGES_MECHES", label: "Balayages et mèches", color: "bg-amber-100 text-amber-800 border-amber-200" },
  { id: "COUPES_COIFFAGE", label: "Coupes et coiffage", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { id: "FORFAITS", label: "Forfaits", color: "bg-rose-100 text-rose-800 border-rose-200" },
];
const inferTheme = (service) => {
  if (service?.theme) return service.theme;
  const name = (service?.name || "").toLocaleLowerCase("fr-FR");
  if (/produit|shampoing|soin à vendre/.test(name)) return "VENTE_PRODUITS";
  if (/balayage|mèche/.test(name)) return "BALAYAGES_MECHES";
  if (/couleur|coloration|patine/.test(name)) return "COLORATIONS";
  if (/forfait|pack/.test(name)) return "FORFAITS";
  return "COUPES_COIFFAGE";
};
const themeInfo = (service) => THEMES.find((theme) => theme.id === inferTheme(service)) || THEMES[3];

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [services, setServices] = useState([]);
  const [addForm, setAddForm] = useState({ name: "", price: 0, category: "HOMME", theme: "COUPES_COIFFAGE", duration_minutes: 30 });
  const [exporting, setExporting] = useState(false);
  const [collapsedServiceCategories, setCollapsedServiceCategories] = useState({});

  const exportBackup = async () => {
    setExporting(true);
    try {
      const r = await api.get("/backup/export");
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sauvegarde-entreprise-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const total = Object.values(r.data.counts || {}).reduce((x, y) => x + y, 0);
      toast.success(`Sauvegarde téléchargée (${total} enregistrements)`);
    } catch {
      toast.error("Export impossible");
    } finally {
      setExporting(false);
    }
  };

  const load = async () => {
    const [s, sv] = await Promise.all([api.get("/settings"), api.get("/services")]);
    setSettings(s.data);
    setServices(sv.data);
  };
  useEffect(() => { load(); }, []);

  const saveSettings = async () => {
    await api.put("/settings", settings);
    toast.success("Réglages enregistrés");
  };

  const createService = async () => {
    if (!addForm.name) return toast.error("Nom requis");
    await api.post("/services", addForm);
    toast.success("Prestation ajoutée");
    setAddForm({ name: "", price: 0, category: "HOMME", theme: "COUPES_COIFFAGE", duration_minutes: 30 });
    load();
  };

  const updateService = async (id, patch) => {
    await api.put(`/services/${id}`, patch);
    load();
  };

  const deleteService = async (id) => {
    if (!window.confirm("Supprimer cette prestation ?")) return;
    await api.delete(`/services/${id}`);
    load();
  };

  const groupedServices = useMemo(() => {
    const groups = Object.fromEntries(SERVICE_CATEGORIES.map((category) => [category.id, []]));
    services.forEach((service) => groups[serviceCategory(service)].push(service));
    Object.values(groups).forEach((items) => items.sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr")));
    return groups;
  }, [services]);

  if (!settings) return <div>…</div>;
  const fb = "w-full bg-transparent border-b border-slate-300 rounded-none px-0 py-2 focus:border-[#0A192F] focus:outline-none text-base";

  return (
    <div className="space-y-10" data-testid="settings-page">
      <div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Paramètres</div>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight">Réglages</h1>
      </div>

      <CompanyProfile />

      <EmployeeManagement />

      <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium" data-testid="backup-section">
        <div className="text-[10px] tracking-widest uppercase text-slate-500 mb-3">Sauvegarde des données</div>
        <div className="text-sm text-slate-500 mb-4">Téléchargez une copie complète de vos données (clients, RDV, prestations, compta, stock, photos…) au format JSON. Conservez ce fichier en lieu sûr.</div>
        <button onClick={exportBackup} disabled={exporting} data-testid="backup-export-btn" className="bg-[#0A192F] text-white rounded-full px-6 py-3 font-medium flex items-center gap-2 disabled:opacity-50">
          <Download className="w-4 h-4" /> {exporting ? "Export en cours…" : "Télécharger la sauvegarde JSON"}
        </button>
      </section>

      <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium">
        <div className="text-[10px] tracking-widest uppercase text-slate-500 mb-3">Synchronisation agenda (iCal)</div>
        <div className="text-sm text-slate-500 mb-4">Ajoutez cette URL dans Google Calendar (Autres agendas › À partir de l'URL) ou Apple Calendar (Fichier › Nouvelle souscription calendrier) pour voir vos RDV sur tous vos appareils.</div>
        <IcalBlock />
      </section>

      <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium" data-testid="business-address-section">
        <div className="text-[10px] tracking-widest uppercase text-slate-500 mb-3">Adresse professionnelle (point de départ)</div>
        <div className="text-sm text-slate-500 mb-4">Adresse utilisée pour calculer le supplément de déplacement de chaque client (distance routière réelle).</div>
        <BusinessAddressBlock settings={settings} setSettings={setSettings} onSave={saveSettings} />
      </section>

      <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium">
        <div className="text-[10px] tracking-widest uppercase text-slate-500 mb-5">Variables comptables</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Prix du litre (€)</label><input type="number" step="0.01" className={fb} data-testid="set-fuel-price" value={settings.fuel_price_per_liter} onChange={(e) => setSettings({ ...settings, fuel_price_per_liter: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Taux URSSAF</label><input type="number" step="0.01" className={fb} value={settings.urssaf_rate} onChange={(e) => setSettings({ ...settings, urssaf_rate: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Consommables / client (€)</label><input type="number" step="0.01" className={fb} value={settings.consumables_per_client} onChange={(e) => setSettings({ ...settings, consumables_per_client: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Frais fixes / mois (€)</label><input type="number" step="0.01" className={fb} value={settings.fixed_costs_monthly} onChange={(e) => setSettings({ ...settings, fixed_costs_monthly: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Supplément carburant / tranche (€)</label><input type="number" step="0.01" className={fb} value={settings.fuel_supplement_per_tier} onChange={(e) => setSettings({ ...settings, fuel_supplement_per_tier: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Tranche KM</label><input type="number" step="1" className={fb} value={settings.fuel_supplement_tier_km} onChange={(e) => setSettings({ ...settings, fuel_supplement_tier_km: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Consommation (L/100km)</label><input type="number" step="0.1" className={fb} value={settings.consumption_l_per_100km} onChange={(e) => setSettings({ ...settings, consumption_l_per_100km: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Frais CB (%)</label><input type="number" step="0.01" className={fb} data-testid="set-cb-rate" value={(settings.cb_fee_rate * 100).toFixed(2)} onChange={(e) => setSettings({ ...settings, cb_fee_rate: (parseFloat(e.target.value) || 0) / 100 })} /><div className="text-[10px] text-slate-500 mt-1">Commission bancaire prélevée sur chaque paiement par carte</div></div>
        </div>
        <button onClick={saveSettings} data-testid="save-settings-btn" className="mt-6 bg-[#0A192F] text-white rounded-full px-6 py-3 font-medium flex items-center gap-2"><Save className="w-4 h-4" /> Enregistrer</button>
      </section>

      <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium" data-testid="goals-section">
        <div className="text-[10px] tracking-widest uppercase text-slate-500 mb-5">Objectifs mensuels</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Objectif CA mensuel (€)</label><input type="number" step="50" className={fb} data-testid="set-goal-ca" value={settings.goal_ca || 0} onChange={(e) => setSettings({ ...settings, goal_ca: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Objectif RDV mensuel</label><input type="number" step="1" className={fb} data-testid="set-goal-rdv" value={settings.goal_rdv || 0} onChange={(e) => setSettings({ ...settings, goal_rdv: parseInt(e.target.value) || 0 })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Objectif panier moyen (€)</label><input type="number" step="1" className={fb} data-testid="set-goal-panier" value={settings.goal_panier || 0} onChange={(e) => setSettings({ ...settings, goal_panier: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Objectif relances</label><input type="number" step="1" className={fb} data-testid="set-goal-relances" value={settings.goal_relances || 0} onChange={(e) => setSettings({ ...settings, goal_relances: parseInt(e.target.value) || 0 })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Parrainage : filleuls / récompense</label><input type="number" step="1" min="1" className={fb} data-testid="set-referral-threshold" value={settings.referral_threshold || 4} onChange={(e) => setSettings({ ...settings, referral_threshold: parseInt(e.target.value) || 4 })} /><div className="text-[10px] text-slate-500 mt-1">Nombre de filleuls pour obtenir 1 coupe offerte (4 = 1 coupe, 8 = 2…)</div></div>
        </div>
        <button onClick={saveSettings} data-testid="save-goals-btn" className="mt-6 bg-[#0A192F] text-white rounded-full px-6 py-3 font-medium flex items-center gap-2"><Save className="w-4 h-4" /> Enregistrer</button>
      </section>

      <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium" data-testid="branding-section">
        <div className="text-[10px] tracking-widest uppercase text-slate-500 mb-5">Identité (signature & visuels)</div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-slate-500">Prénom (signature SMS / visuels Avant·Après)</label>
          <input className={fb} data-testid="set-brand-name" value={settings.brand_name || ""} onChange={(e) => setSettings({ ...settings, brand_name: e.target.value })} placeholder="Nom de votre entreprise" />
          <div className="text-[10px] text-slate-500 mt-2">Apparaît dans la signature des SMS de relance et sur les visuels Avant·Après partagés.</div>
        </div>
        <button onClick={saveSettings} data-testid="save-brand-btn" className="mt-6 bg-[#0A192F] text-white rounded-full px-6 py-3 font-medium flex items-center gap-2"><Save className="w-4 h-4" /> Enregistrer</button>
      </section>

      <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium" data-testid="review-section">
        <div className="text-[10px] tracking-widest uppercase text-slate-500 mb-2">Avis Google</div>
        <div className="text-xs text-slate-500 mb-4 leading-relaxed">
          Collez ici votre lien direct vers votre page d'avis Google (format court <span className="font-mono">g.page/r/XXXX/review</span>).
          Un bouton <span className="font-medium text-[#8A6A1F]">« Demander un avis »</span> apparaîtra sur chaque fiche client.
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-500">Lien d'avis Google</label>
            <input className={fb} data-testid="set-review-url" value={settings.google_review_url || ""} onChange={(e) => setSettings({ ...settings, google_review_url: e.target.value })} placeholder="https://g.page/r/CXXXXXX/review" />
          </div>
          {settings.google_review_url_short && settings.google_review_url_short !== settings.google_review_url && (
            <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl p-3 flex items-center gap-2" data-testid="review-short-block">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] tracking-widest uppercase text-[#8A6A1F] mb-1">Lien court utilisé dans le SMS</div>
                <div className="font-mono text-sm text-slate-800 truncate" data-testid="review-short-url">{settings.google_review_url_short}</div>
              </div>
              <button
                type="button"
                onClick={async () => { await navigator.clipboard.writeText(settings.google_review_url_short); toast.success("Copié"); }}
                className="text-[#8A6A1F] hover:bg-[#D4AF37]/20 p-2 rounded-full flex-shrink-0"
                data-testid="review-short-copy"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          )}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-500">Message SMS envoyé au client</label>
            <textarea rows={3} className={fb + " leading-relaxed"} data-testid="set-review-template" value={settings.review_sms_template || ""} onChange={(e) => setSettings({ ...settings, review_sms_template: e.target.value })} placeholder="Bonjour {first_name}, ..." />
            <div className="text-[10px] text-slate-500 mt-2">Variables disponibles : <span className="font-mono">{"{first_name}"}</span> · <span className="font-mono">{"{last_name}"}</span> · <span className="font-mono">{"{url}"}</span> · <span className="font-mono">{"{brand_name}"}</span></div>
          </div>
        </div>
        <button onClick={saveSettings} data-testid="save-review-btn" className="mt-6 bg-[#0A192F] text-white rounded-full px-6 py-3 font-medium flex items-center gap-2"><Save className="w-4 h-4" /> Enregistrer</button>
      </section>

      <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium" data-testid="reminder-section">
        <div className="text-[10px] tracking-widest uppercase text-slate-500 mb-2">Rappel de RDV (SMS 24h avant)</div>
        <div className="text-xs text-slate-500 mb-4 leading-relaxed">
          Chaque jour, le tableau de bord liste les RDV du lendemain avec un bouton <span className="font-medium text-[#1E3A8A]">« Envoyer le rappel »</span> qui ouvre votre app SMS avec ce message pré-rempli.
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-slate-500">Message de rappel</label>
          <textarea rows={3} className={fb + " leading-relaxed"} data-testid="set-reminder-template" value={settings.reminder_sms_template || ""} onChange={(e) => setSettings({ ...settings, reminder_sms_template: e.target.value })} placeholder="Bonjour {first_name}, ..." />
          <div className="text-[10px] text-slate-500 mt-2">Variables : <span className="font-mono">{"{first_name}"}</span> · <span className="font-mono">{"{time}"}</span> · <span className="font-mono">{"{date}"}</span> · <span className="font-mono">{"{services}"}</span> · <span className="font-mono">{"{brand_name}"}</span></div>
        </div>
        <button onClick={saveSettings} data-testid="save-reminder-btn" className="mt-6 bg-[#0A192F] text-white rounded-full px-6 py-3 font-medium flex items-center gap-2"><Save className="w-4 h-4" /> Enregistrer</button>
      </section>

      <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium">
        <div className="flex items-center justify-between mb-5">
          <div className="text-[10px] tracking-widest uppercase text-slate-500">Prestations & tarifs</div>
        </div>
        <div className="bg-slate-50 rounded-2xl p-4 mb-6 space-y-4" data-testid="svc-add-form">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-500">Nom de la prestation</label>
            <input data-testid="svc-add-name" className={fb} placeholder="Ex : Couleur femme" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500">Prix (€)</label>
              <input data-testid="svc-add-price" type="number" step="0.5" className={fb} value={addForm.price} onChange={(e) => setAddForm({ ...addForm, price: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500">Durée moyenne (min)</label>
              <input data-testid="svc-add-duration" type="number" step="5" min="5" className={fb} value={addForm.duration_minutes} onChange={(e) => setAddForm({ ...addForm, duration_minutes: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="text-[10px] text-slate-500 -mt-2">{addForm.category === "HOMME" ? "Apparaîtra dans les prestations Homme" : addForm.category === "FEMME" ? "Apparaîtra dans les prestations Femme" : addForm.category === "ENFANT" ? "Apparaîtra dans les prestations Enfant" : "Apparaîtra dans Pack famille et restera accessible pour tous les clients"}</div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-500">Thème</label>
            <div className="flex flex-wrap gap-2 mt-2" data-testid="svc-theme-picker">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setAddForm({ ...addForm, theme: theme.id })}
                  data-testid={`svc-add-theme-${theme.id}`}
                  className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all ${addForm.theme === theme.id ? theme.color + " shadow-sm" : "border-slate-200 text-slate-600 bg-white"}`}
                >
                  {theme.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-500">Pour qui ?</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                { id: "HOMME", l: "Homme", color: "bg-blue-500" },
                { id: "FEMME", l: "Femme", color: "bg-pink-500" },
                { id: "ENFANT", l: "Enfant", color: "bg-green-500" },
                { id: "FAMILLE", l: "Pack famille", color: "bg-amber-500" },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setAddForm({ ...addForm, category: c.id })}
                  data-testid={`svc-add-cat-${c.id}`}
                  className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all ${addForm.category === c.id ? `${c.color} text-white shadow-lg` : "border border-slate-200 text-slate-600 bg-white hover:bg-slate-50"}`}
                >
                  {c.l}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={createService}
            data-testid="svc-add-btn"
            className="w-full bg-[#0A192F] text-white rounded-full px-6 py-3.5 font-medium flex items-center justify-center gap-2 hover:bg-[#1E3A8A] transition-colors"
          >
            <Plus className="w-4 h-4" /> Ajouter la prestation
          </button>
        </div>

        <div className="space-y-3" data-testid="service-category-groups">
          {SERVICE_CATEGORIES.map((group) => {
            const items = groupedServices[group.id] || [];
            const collapsed = !!collapsedServiceCategories[group.id];
            return (
              <section key={group.id} className="rounded-2xl border border-slate-200 overflow-hidden" data-testid={"svc-group-" + group.id.toLowerCase()}>
                <button
                  type="button"
                  onClick={() => setCollapsedServiceCategories((current) => ({ ...current, [group.id]: !current[group.id] }))}
                  aria-expanded={!collapsed}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  <span className="font-medium flex-1">{group.label}</span>
                  <span className={"text-xs rounded-full px-2.5 py-1 " + group.color}>{items.length}</span>
                </button>
                {!collapsed && (
                  <ul className="divide-y divide-slate-100 px-4">
                    {items.length === 0 && <li className="py-4 text-sm text-slate-500">Aucune prestation dans cette catégorie.</li>}
                    {items.map((s) => {
                      const theme = themeInfo(s);
                      return (
                        <li key={s.id} className="py-3" data-testid={"svc-row-" + s.id}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={"text-[9px] tracking-wider uppercase px-2 py-0.5 rounded-full " + group.color}>{group.label}</span>
                            <input aria-label={"Nom de la prestation " + s.name} className="flex-1 min-w-[140px] bg-transparent border-b border-slate-200 py-1 focus:border-[#0A192F] focus:outline-none" defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && updateService(s.id, { name: e.target.value })} />
                            <select aria-label={"Catégorie de " + s.name} className="text-xs bg-transparent border-b border-slate-200 py-1 focus:border-[#0A192F] focus:outline-none" value={serviceCategory(s)} onChange={(e) => updateService(s.id, { category: e.target.value })}>
                              {SERVICE_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                            </select>
                            <span className={"text-[9px] px-2 py-1 rounded-full border " + theme.color}>{theme.label}</span>
                            <select
                              aria-label="Thème de la prestation"
                              className="text-xs bg-transparent border-b border-slate-200 py-1 focus:border-[#0A192F] focus:outline-none"
                              value={inferTheme(s)}
                              onChange={(e) => updateService(s.id, { theme: e.target.value })}
                            >
                              {THEMES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                            </select>
                            <button type="button" aria-label={"Supprimer " + s.name} onClick={() => deleteService(s.id)} className="text-[#991B1B] hover:bg-red-50 p-2 rounded-full" data-testid={"svc-del-" + s.id}><Trash2 className="w-4 h-4" /></button>
                          </div>
                          <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 pl-1">
                            <label className="flex items-center gap-1">
                              Prix
                              <input data-testid={"svc-price-" + s.id} type="number" step="0.5" className="w-20 text-right bg-transparent border-b border-slate-200 py-0.5 focus:border-[#0A192F] focus:outline-none" defaultValue={s.price} onBlur={(e) => parseFloat(e.target.value) !== s.price && updateService(s.id, { price: parseFloat(e.target.value) || 0 })} />
                              <span>€</span>
                            </label>
                            <label className="flex items-center gap-1">
                              Durée
                              <input data-testid={"svc-duration-" + s.id} type="number" step="5" min="5" className="w-16 text-right bg-transparent border-b border-slate-200 py-0.5 focus:border-[#0A192F] focus:outline-none" defaultValue={s.duration_minutes ?? 45} onBlur={(e) => { const value = parseInt(e.target.value) || 0; if (value !== s.duration_minutes) updateService(s.id, { duration_minutes: value }); }} />
                              <span>min</span>
                            </label>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
