import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, money, money2, fmtDate, fmtTime } from "@/lib/api";
import { ArrowLeft, MapPin, Phone, Cake, Plus, Trash2, Save, Gift, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";

function LoyaltyRow({ count, label, price }) {
  const slots = Array.from({ length: 5 }, (_, i) => i < Math.min(count, 5));
  const giftDone = count >= 5;
  const remaining = Math.max(0, 5 - count);
  return (
    <div className="flex items-center gap-4 py-3" data-testid={`loyalty-row-${label}`}>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {giftDone ? "🎁 Gratuité disponible" : `Reste ${remaining} avant gratuité · ${money(price)}`}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {slots.map((f, i) => <span key={i} className={`slot ${f ? "filled" : ""}`}></span>)}
        <span className={`slot gift ${giftDone ? "" : "opacity-40"}`}></span>
      </div>
      <div className="text-xs tabular-nums text-slate-500 w-10 text-right">{Math.min(count, 5)}/5</div>
    </div>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [services, setServices] = useState([]);
  const [tab, setTab] = useState("infos");
  const [cf, setCf] = useState({ key: "", value: "" });
  const [editing, setEditing] = useState({});

  const load = async () => {
    const [r, s] = await Promise.all([api.get(`/clients/${id}`), api.get("/services")]);
    setData(r.data);
    setServices(s.data);
    setEditing({
      first_name: r.data.client.first_name,
      last_name: r.data.client.last_name,
      phone: r.data.client.phone,
      address: r.data.client.address,
      comment: r.data.client.comment,
      birthday: r.data.client.birthday || "",
      referrals: r.data.client.referrals || 0,
    });
  };

  useEffect(() => { load(); }, [id]);

  if (!data) return <div className="text-slate-500">Chargement…</div>;
  const c = data.client;

  const save = async () => {
    await api.put(`/clients/${id}`, editing);
    toast.success("Enregistré");
    load();
  };

  const addCustomField = async () => {
    if (!cf.key) return;
    const next = { ...(c.custom_fields || {}), [cf.key]: cf.value };
    await api.put(`/clients/${id}`, { custom_fields: next });
    setCf({ key: "", value: "" });
    load();
  };
  const removeCustomField = async (k) => {
    const next = { ...(c.custom_fields || {}) };
    delete next[k];
    await api.put(`/clients/${id}`, { custom_fields: next });
    load();
  };

  const remove = async () => {
    if (!window.confirm("Supprimer définitivement ce client (et ses RDV) ?")) return;
    await api.delete(`/clients/${id}`);
    toast.success("Supprimé");
    navigate("/clients");
  };

  const done = data.appointments.filter((a) => a.status === "done");
  const avg = done.length ? done.reduce((a, b) => a + b.price_final, 0) / done.length : 0;
  const total = done.reduce((a, b) => a + b.price_final, 0);
  const fb = "w-full bg-transparent border-b border-slate-300 rounded-none px-0 py-2 focus:border-[#0A192F] focus:outline-none text-base";

  const mapsUrl = c.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}` : null;

  return (
    <div className="space-y-8 max-w-5xl" data-testid="client-detail-page">
      <button onClick={() => navigate(-1)} className="text-sm text-slate-500 hover:text-[#0A192F] flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Retour</button>

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Fiche client</div>
          <h1 className="font-serif text-4xl md:text-5xl tracking-tight">{c.first_name} <span className="font-semibold">{c.last_name}</span></h1>
          <div className="text-slate-500 mt-2 text-sm flex flex-wrap items-center gap-4">
            {c.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {c.phone}</span>}
            {c.birthday && <span className="flex items-center gap-1.5"><Cake className="w-3.5 h-3.5" /> {new Date(c.birthday).toLocaleDateString("fr-FR")}</span>}
            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-[#0A192F]" data-testid="maps-link"><MapPin className="w-3.5 h-3.5" /> Voir sur Google Maps</a>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/rdv/nouveau?client=${c.id}`} data-testid="client-new-rdv" className="bg-[#0A192F] text-white rounded-full px-5 py-2.5 text-sm font-medium hover:bg-[#1E3A8A] flex items-center gap-2"><Plus className="w-4 h-4" /> RDV</Link>
          <button onClick={remove} data-testid="delete-client-btn" className="rounded-full px-4 py-2.5 border border-red-200 text-[#991B1B] hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-100 rounded-2xl p-5"><div className="text-[10px] tracking-widest uppercase text-slate-500">RDV terminés</div><div className="font-serif text-2xl">{done.length}</div></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5"><div className="text-[10px] tracking-widest uppercase text-slate-500">Panier moyen</div><div className="font-serif text-2xl">{money2(avg)} €</div></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-5"><div className="text-[10px] tracking-widest uppercase text-slate-500">Total cumulé</div><div className="font-serif text-2xl">{money2(total)} €</div></div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[{ id: "infos", l: "Informations" }, { id: "loyalty", l: "Suivi Gratuité" }, { id: "history", l: "Historique" }, { id: "custom", l: "Champs personnalisés" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`} className={`px-4 py-2 rounded-full text-sm ${tab === t.id ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>{t.l}</button>
        ))}
      </div>

      {tab === "infos" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6 shadow-premium">
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">Prénom</label><input className={fb} value={editing.first_name} onChange={(e) => setEditing({ ...editing, first_name: e.target.value })} /></div>
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">Nom</label><input className={fb} value={editing.last_name} onChange={(e) => setEditing({ ...editing, last_name: e.target.value })} /></div>
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">Téléphone</label><input className={fb} value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">Anniversaire</label><input type="date" className={fb} value={editing.birthday} onChange={(e) => setEditing({ ...editing, birthday: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="text-[10px] tracking-widest uppercase text-slate-500">Adresse</label><input className={fb} value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="text-[10px] tracking-widest uppercase text-slate-500">Commentaire permanent</label><textarea rows={3} className={`${fb} resize-none`} value={editing.comment} onChange={(e) => setEditing({ ...editing, comment: e.target.value })} /></div>
          <div>
            <label className="text-[10px] tracking-widest uppercase text-slate-500">Filleuls validés</label>
            <input type="number" className={fb} value={editing.referrals} onChange={(e) => setEditing({ ...editing, referrals: parseInt(e.target.value) || 0 })} />
            {editing.referrals >= 2 && <div className="text-xs text-[#C5A059] mt-1 flex items-center gap-1"><UsersIcon className="w-3 h-3" /> Prochaine prestation OFFERTE (parrainage)</div>}
          </div>
          <div className="md:col-span-2"><button onClick={save} data-testid="save-client-btn" className="bg-[#0A192F] text-white rounded-full px-6 py-3 font-medium flex items-center gap-2"><Save className="w-4 h-4" /> Enregistrer</button></div>
        </div>
      )}

      {tab === "loyalty" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium divide-y divide-slate-100">
          {services.map((s) => (
            <LoyaltyRow key={s.id} count={c.loyalty_counters?.[s.id] || 0} label={s.name} price={s.price} />
          ))}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-2">
          {data.appointments.length === 0 ? <div className="text-slate-400 text-sm">Aucun historique.</div> :
            data.appointments.map((a) => (
              <Link key={a.id} to={`/rdv/${a.id}`} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-white hover:shadow-premium">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{fmtDate(a.date)} · {fmtTime(a.date)}</div>
                  <div className="text-xs text-slate-500 truncate">{a.services.map(s => s.name + (s.is_gift ? " 🎁" : "")).join(", ")}</div>
                </div>
                <div className="text-right">
                  <div className="font-serif text-lg">{money(a.price_final)}</div>
                  <div className="text-[10px] tracking-widest uppercase text-slate-400">{a.status === "done" ? a.payment_mode : "Prévu"}</div>
                </div>
              </Link>
            ))
          }
        </div>
      )}

      {tab === "custom" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium">
          <div className="flex flex-col md:flex-row gap-3 mb-6">
            <input data-testid="cf-key" placeholder="Nom du champ (ex: Allergies)" className={fb + " md:flex-1"} value={cf.key} onChange={(e) => setCf({ ...cf, key: e.target.value })} />
            <input data-testid="cf-value" placeholder="Valeur" className={fb + " md:flex-1"} value={cf.value} onChange={(e) => setCf({ ...cf, value: e.target.value })} />
            <button onClick={addCustomField} data-testid="cf-add" className="bg-[#0A192F] text-white rounded-full px-6 py-2 text-sm">Ajouter</button>
          </div>
          <ul className="divide-y divide-slate-100">
            {Object.entries(c.custom_fields || {}).map(([k, v]) => (
              <li key={k} className="flex items-center gap-4 py-3">
                <div className="flex-1"><div className="text-xs text-slate-500 uppercase tracking-wider">{k}</div><div>{v}</div></div>
                <button onClick={() => removeCustomField(k)} className="text-[#991B1B] text-sm">Supprimer</button>
              </li>
            ))}
            {Object.keys(c.custom_fields || {}).length === 0 && <li className="text-slate-400 text-sm py-3">Aucun champ personnalisé.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
