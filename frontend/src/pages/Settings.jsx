import React, { useEffect, useState } from "react";
import { api, money, API } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Save, Copy, Calendar, Download } from "lucide-react";

function IcalBlock() {
  const [url, setUrl] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/calendar/ical-url");
        setUrl(`${API}/calendar/${r.data.token}.ics`);
      } catch (e) {
        console.warn("ical url:", e);
      }
    })();
  }, []);
  const copy = async () => {
    if (!url) return toast.error("Session indisponible — reconnectez-vous");
    await navigator.clipboard.writeText(url);
    toast.success("URL copiée dans le presse-papiers");
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input data-testid="ical-url" readOnly value={url || "Reconnectez-vous pour générer l'URL"} className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-full px-4 py-2 text-xs text-slate-600" />
      <button onClick={copy} data-testid="ical-copy" className="rounded-full px-4 py-2 border border-slate-200 text-sm flex items-center gap-2"><Copy className="w-4 h-4" /> Copier</button>
      {url && <a href={url} download="julienbouche.ics" data-testid="ical-download" className="rounded-full px-4 py-2 bg-[#0A192F] text-white text-sm flex items-center gap-2"><Calendar className="w-4 h-4" /> Télécharger .ics</a>}
    </div>
  );
}

const CATS = ["HOMME", "FEMME", "ENFANT", "AUTRE"];

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [services, setServices] = useState([]);
  const [addForm, setAddForm] = useState({ name: "", price: 0, category: "HOMME", duration_minutes: 30 });
  const [exporting, setExporting] = useState(false);

  const exportBackup = async () => {
    setExporting(true);
    try {
      const r = await api.get("/backup/export");
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sauvegarde-julienbouche-${new Date().toISOString().slice(0, 10)}.json`;
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
    setAddForm({ name: "", price: 0, category: "HOMME", duration_minutes: 30 });
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

  if (!settings) return <div>…</div>;
  const fb = "w-full bg-transparent border-b border-slate-300 rounded-none px-0 py-2 focus:border-[#0A192F] focus:outline-none text-base";

  return (
    <div className="space-y-10" data-testid="settings-page">
      <div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Paramètres</div>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight">Réglages</h1>
      </div>

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
          <input className={fb} data-testid="set-brand-name" value={settings.brand_name || ""} onChange={(e) => setSettings({ ...settings, brand_name: e.target.value })} placeholder="Julien" />
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
          <div className="text-[10px] text-slate-500 -mt-2">{addForm.category === "HOMME" ? "Apparaîtra dans les fiches M." : addForm.category === "FEMME" ? "Apparaîtra dans les fiches Mme" : addForm.category === "ENFANT" ? "Apparaîtra dans les fiches < 18 ans" : "Apparaîtra dans toutes les fiches"}</div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-500">Pour qui ?</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                { id: "HOMME", l: "Homme", color: "bg-blue-500" },
                { id: "FEMME", l: "Femme", color: "bg-pink-500" },
                { id: "ENFANT", l: "Enfant", color: "bg-green-500" },
                { id: "AUTRE", l: "Tous", color: "bg-slate-500" },
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

        <ul className="divide-y divide-slate-100">
          {services.map((s) => {
            const catColor = s.category === "HOMME" ? "bg-blue-100 text-blue-700" : s.category === "FEMME" ? "bg-pink-100 text-pink-700" : s.category === "ENFANT" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-700";
            return (
              <li key={s.id} className="py-3" data-testid={`svc-row-${s.id}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[9px] tracking-wider uppercase px-2 py-0.5 rounded-full ${catColor}`}>{s.category}</span>
                  <input className="flex-1 min-w-[140px] bg-transparent border-b border-slate-200 py-1 focus:border-[#0A192F] focus:outline-none" defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && updateService(s.id, { name: e.target.value })} />
                  <select className="text-xs bg-transparent border-b border-slate-200 py-1 focus:border-[#0A192F] focus:outline-none" defaultValue={s.category} onChange={(e) => updateService(s.id, { category: e.target.value })}>
                    {CATS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <button onClick={() => deleteService(s.id)} className="text-[#991B1B] hover:bg-red-50 p-2 rounded-full" data-testid={`svc-del-${s.id}`}><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 pl-1">
                  <label className="flex items-center gap-1">
                    Prix
                    <input data-testid={`svc-price-${s.id}`} type="number" step="0.5" className="w-20 text-right bg-transparent border-b border-slate-200 py-0.5 focus:border-[#0A192F] focus:outline-none" defaultValue={s.price} onBlur={(e) => parseFloat(e.target.value) !== s.price && updateService(s.id, { price: parseFloat(e.target.value) || 0 })} />
                    <span>€</span>
                  </label>
                  <label className="flex items-center gap-1">
                    Durée
                    <input data-testid={`svc-duration-${s.id}`} type="number" step="5" min="5" className="w-16 text-right bg-transparent border-b border-slate-200 py-0.5 focus:border-[#0A192F] focus:outline-none" defaultValue={s.duration_minutes ?? 45} onBlur={(e) => { const v = parseInt(e.target.value) || 0; if (v !== s.duration_minutes) updateService(s.id, { duration_minutes: v }); }} />
                    <span>min</span>
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
