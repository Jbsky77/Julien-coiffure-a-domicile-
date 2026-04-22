import React, { useEffect, useState } from "react";
import { api, money, API } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Save, Copy, Calendar } from "lucide-react";

function IcalBlock() {
  const [url, setUrl] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/calendar/ical-url");
        setUrl(`${API}/calendar/${r.data.token}.ics`);
      } catch (e) {}
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
  const [addForm, setAddForm] = useState({ name: "", price: 0, category: "HOMME" });

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
    setAddForm({ name: "", price: 0, category: "HOMME" });
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
        </div>
        <button onClick={saveSettings} data-testid="save-settings-btn" className="mt-6 bg-[#0A192F] text-white rounded-full px-6 py-3 font-medium flex items-center gap-2"><Save className="w-4 h-4" /> Enregistrer</button>
      </section>

      <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium">
        <div className="flex items-center justify-between mb-5">
          <div className="text-[10px] tracking-widest uppercase text-slate-500">Prestations & tarifs</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 items-end">
          <div className="md:col-span-2"><label className="text-[10px] uppercase tracking-widest text-slate-500">Nom</label><input data-testid="svc-add-name" className={fb} value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Prix (€)</label><input data-testid="svc-add-price" type="number" step="0.5" className={fb} value={addForm.price} onChange={(e) => setAddForm({ ...addForm, price: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Catégorie</label>
            <select className={fb} data-testid="svc-add-cat" value={addForm.category} onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}>
              {CATS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="md:col-span-4"><button onClick={createService} data-testid="svc-add-btn" className="bg-[#0A192F] text-white rounded-full px-6 py-3 flex items-center gap-2"><Plus className="w-4 h-4" /> Ajouter la prestation</button></div>
        </div>

        <ul className="divide-y divide-slate-100">
          {services.map((s) => (
            <li key={s.id} className="py-3 grid grid-cols-6 gap-3 items-center" data-testid={`svc-row-${s.id}`}>
              <input className="col-span-3 bg-transparent border-b border-slate-200 py-1 focus:border-[#0A192F] focus:outline-none" defaultValue={s.name} onBlur={(e) => e.target.value !== s.name && updateService(s.id, { name: e.target.value })} />
              <input type="number" step="0.5" className="bg-transparent border-b border-slate-200 py-1 focus:border-[#0A192F] focus:outline-none" defaultValue={s.price} onBlur={(e) => parseFloat(e.target.value) !== s.price && updateService(s.id, { price: parseFloat(e.target.value) || 0 })} />
              <select className="bg-transparent border-b border-slate-200 py-1 focus:border-[#0A192F] focus:outline-none" defaultValue={s.category} onChange={(e) => updateService(s.id, { category: e.target.value })}>
                {CATS.map((c) => <option key={c}>{c}</option>)}
              </select>
              <button onClick={() => deleteService(s.id)} className="justify-self-end text-[#991B1B] hover:bg-red-50 p-2 rounded-full" data-testid={`svc-del-${s.id}`}><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
