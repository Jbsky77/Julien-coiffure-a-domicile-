import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, money, money2, fmtDate, fmtTime, genderClasses, genderLabel, computeAge } from "@/lib/api";
import { AddressAutocomplete, composeAddress, emptyParts } from "@/components/app/AddressAutocomplete";
import { ArrowLeft, MapPin, Phone, Cake, Plus, Trash2, Save, Gift, Users as UsersIcon, Mail, MessageSquare, Star, CreditCard, Copy, ExternalLink, CalendarClock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import ClientPhotos from "@/components/app/ClientPhotos";

const PUBLIC_APP_ORIGIN = (process.env.REACT_APP_PUBLIC_APP_URL || "https://julien-coiffure-domicile.vercel.app").replace(/\/$/, "");

function LoyaltyRow({ count, label, price }) {
  const slots = Array.from({ length: 5 }, (_, i) => i < Math.min(count, 5));
  const giftDone = count >= 5;
  const remaining = Math.max(0, 5 - count);
  return (
    <div className="flex items-center gap-4 py-3" data-testid={`loyalty-row-${label}`}>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {giftDone ? "ðŸŽ GratuitÃ© disponible" : `Reste ${remaining} avant gratuitÃ© Â· ${money(price)}`}
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
  const [allClients, setAllClients] = useState([]);
  const [settings, setSettings] = useState({ cb_fee_rate: 0.0175 });
  const [tab, setTab] = useState("infos");
  const [cf, setCf] = useState({ key: "", value: "" });
  const [editing, setEditing] = useState({});
  const [editCoords, setEditCoords] = useState(null);

  const load = useCallback(async () => {
    const [r, s, st, cl] = await Promise.all([api.get(`/clients/${id}`), api.get("/services"), api.get("/settings"), api.get("/clients")]);
    setData(r.data);
    setServices(s.data);
    setSettings(st.data);
    setAllClients(cl.data);
    setEditing({
      first_name: r.data.client.first_name,
      last_name: r.data.client.last_name,
      gender: r.data.client.gender || "",
      phone: r.data.client.phone,
      address: r.data.client.address,
      address_parts: r.data.client.address_parts || { ...emptyParts },
      comment: r.data.client.comment,
      birthday: r.data.client.birthday || "",
      referred_by: r.data.client.referred_by || "",
      deposit_required: r.data.client.deposit_required || false,
      deposit_note: r.data.client.deposit_note || "",
    });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="text-slate-500">Chargementâ€¦</div>;
  const c = data.client;
  const gc = genderClasses(c.gender);
  const age = computeAge(c.birthday);

  const save = async () => {
    const composed = composeAddress(editing.address_parts);
    const payload = { ...editing, address: composed || editing.address, referred_by: editing.referred_by || null };
    if (editCoords) { payload.lat = editCoords.lat; payload.lng = editCoords.lng; }
    await api.put(`/clients/${id}`, payload);
    setEditCoords(null);
    toast.success("EnregistrÃ©");
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
    if (!window.confirm("Supprimer dÃ©finitivement ce client (et ses RDV) ?")) return;
    await api.delete(`/clients/${id}`);
    toast.success("SupprimÃ©");
    navigate("/clients");
  };

  const done = data.appointments.filter((a) => a.status === "done");
  const cancelledCount = data.appointments.filter((a) => a.status === "cancelled").length;
  const avg = done.length ? done.reduce((a, b) => a + b.price_final, 0) / done.length : 0;
  const total = done.reduce((a, b) => a + b.price_final, 0);
  const cbFeeRate = settings.cb_fee_rate || 0.0175;
  const cbTotal = done.filter((a) => a.payment_mode === "CB").reduce((acc, a) => acc + a.price_final, 0);
  const cbFees = cbTotal * cbFeeRate;
  const netReceived = total - cbFees;
  const durations = done.map((a) => a.duration_minutes).filter((x) => x);
  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const totalDuration = durations.reduce((a, b) => a + b, 0);
  const fb = "w-full bg-transparent border-b border-slate-300 rounded-none px-0 py-2 focus:border-[#0A192F] focus:outline-none text-base";

  const mapsUrl = c.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}` : null;
  const smsLink = c.phone ? `sms:${c.phone.replace(/\s/g, "")}?body=${encodeURIComponent(`Bonjour ${c.first_name || ""}, c'est Julien Bouche. `)}` : null;
  const mailLink = `mailto:?subject=${encodeURIComponent("Prendre rendez-vous")}&body=${encodeURIComponent(`Bonjour ${c.first_name || c.last_name},\n\nJ'espÃ¨re que vous allez bien. Souhaitez-vous prendre un nouveau rendez-vous ?\n\nÃ€ bientÃ´t,\nJulien Bouche`)}`;

  const reviewUrl = (settings.google_review_url_short || settings.google_review_url || "").trim();
  const reviewSmsHref = (() => {
    if (!c.phone || !reviewUrl) return null;
    const template = settings.review_sms_template || "Bonjour {first_name}, merci pour votre confiance ! Donnez votre avis sur votre coiffeur ici : {url} â€” {brand_name}";
    const body = template
      .replace(/\{first_name\}/g, c.first_name || "")
      .replace(/\{last_name\}/g, c.last_name || "")
      .replace(/\{url\}/g, reviewUrl)
      .replace(/\{brand_name\}/g, settings.brand_name || "Julien");
    return `sms:${c.phone.replace(/\s/g, "")}?body=${encodeURIComponent(body)}`;
  })();
  const reviewDisabledReason = !c.phone ? "Ajoutez un tÃ©lÃ©phone Ã  la fiche client" : !reviewUrl ? "Configurez votre lien d'avis dans RÃ©glages" : null;

  // Toujours envoyer le domaine public, mÃªme si la fiche est ouverte depuis une prÃ©visualisation Vercel.
  const spaceUrl = c.access_token ? `${PUBLIC_APP_ORIGIN}/c/${c.access_token}` : null;
  const cardSmsHref = (() => {
    if (!c.phone || !spaceUrl) return null;
    const body = `Bonjour ${c.first_name || ""}, voici votre espace personnel avec votre carte de fidÃ©litÃ© : ${spaceUrl} â€” ${settings.brand_name || "Julien"}`;
    return `sms:${c.phone.replace(/\s/g, "")}?body=${encodeURIComponent(body)}`;
  })();
  const copySpaceUrl = async () => {
    if (!spaceUrl) return;
    try {
      await navigator.clipboard.writeText(spaceUrl);
      toast.success("Lien copiÃ©");
    } catch { toast.error("Copie impossible"); }
  };

  return (
    <div className={`space-y-8 max-w-5xl p-4 rounded-3xl border-2 ${gc.border} ${gc.bg}`} data-testid="client-detail-page">
      <button onClick={() => navigate(-1)} className="text-sm text-slate-500 hover:text-[#0A192F] flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Retour</button>

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Fiche client</div>
          <h1 className="font-serif text-4xl md:text-5xl tracking-tight">
            {genderLabel(c.gender) && <span className="text-slate-500 text-2xl md:text-3xl mr-2">{genderLabel(c.gender)}</span>}
            {c.first_name} <span className="font-semibold">{c.last_name}</span>
          </h1>
          <div className="text-slate-500 mt-2 text-sm flex flex-wrap items-center gap-4">
            {c.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {c.phone}</span>}
            {c.birthday && <span className="flex items-center gap-1.5"><Cake className="w-3.5 h-3.5" /> {new Date(c.birthday).toLocaleDateString("fr-FR")}{age !== null && <span className="ml-1">Â· {age} ans</span>}</span>}
            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-[#0A192F]" data-testid="maps-link"><MapPin className="w-3.5 h-3.5" /> Voir sur Google Maps</a>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {smsLink && <a href={smsLink} data-testid="sms-link" className="rounded-full px-4 py-2.5 border border-slate-200 text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4" /> SMS</a>}
          <a href={mailLink} data-testid="mail-link" className="rounded-full px-4 py-2.5 border border-slate-200 text-sm flex items-center gap-2"><Mail className="w-4 h-4" /> Email</a>
          {reviewSmsHref ? (
            <a href={reviewSmsHref} data-testid="ask-review-btn" className="rounded-full px-4 py-2.5 bg-gold-gradient text-white text-sm flex items-center gap-2 shadow-premium"><Star className="w-4 h-4 fill-current" /> Demander un avis</a>
          ) : (
            <button onClick={() => toast.info(reviewDisabledReason || "Non configurÃ©")} data-testid="ask-review-disabled" className="rounded-full px-4 py-2.5 border border-[#D4AF37]/50 text-[#8A6A1F] text-sm flex items-center gap-2 opacity-70"><Star className="w-4 h-4" /> Demander un avis</button>
          )}
          <Link to={`/rdv/nouveau?client=${c.id}`} data-testid="client-new-rdv" className="bg-[#0A192F] text-white rounded-full px-5 py-2.5 text-sm font-medium hover:bg-[#1E3A8A] flex items-center gap-2"><Plus className="w-4 h-4" /> RDV</Link>
          <button onClick={remove} data-testid="delete-client-btn" className="rounded-full px-4 py-2.5 border border-red-200 text-[#991B1B] hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Espace client â€” magic link + SMS */}
      {spaceUrl && (
        <div className="bg-gradient-to-br from-[#D4AF37]/10 via-white to-[#0A192F]/5 border border-[#D4AF37]/30 rounded-2xl p-5 space-y-3" data-testid="client-space-card">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#8A6A1F] flex items-center gap-1.5"><CreditCard className="w-3 h-3 flex-shrink-0" /> Espace client & carte de fidÃ©litÃ©</div>
            <div className="mt-2 font-mono text-[11px] text-slate-500 truncate" data-testid="client-space-url">{spaceUrl}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={copySpaceUrl} data-testid="copy-space-url" className="rounded-full px-4 py-2 border border-slate-200 text-slate-700 text-xs flex items-center gap-1.5 hover:bg-white"><Copy className="w-3.5 h-3.5" /> Copier</button>
            <a href={spaceUrl} target="_blank" rel="noopener noreferrer" data-testid="open-space-url" className="rounded-full px-4 py-2 border border-slate-200 text-slate-700 text-xs flex items-center gap-1.5 hover:bg-white"><ExternalLink className="w-3.5 h-3.5" /> AperÃ§u</a>
            {cardSmsHref ? (
              <a href={cardSmsHref} data-testid="send-card-sms" className="rounded-full px-4 py-2 bg-gold-gradient text-white text-xs flex items-center gap-1.5 shadow-premium"><CreditCard className="w-3.5 h-3.5" /> Envoyer la carte de fidÃ©litÃ©</a>
            ) : (
              <button onClick={() => toast.info("Ajoutez un tÃ©lÃ©phone Ã  la fiche pour envoyer le SMS")} data-testid="send-card-sms-disabled" className="rounded-full px-4 py-2 border border-[#D4AF37]/50 text-[#8A6A1F] text-xs flex items-center gap-1.5 opacity-70"><CreditCard className="w-3.5 h-3.5" /> Envoyer la carte de fidÃ©litÃ©</button>
            )}
          </div>
        </div>
      )}

      {/* Next visit recommendation */}
      {data.next_visit && (
        <div className="bg-white border border-[#D4AF37]/40 rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-3" data-testid="next-visit-admin">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#8A6A1F] mb-1 flex items-center gap-1.5"><CalendarClock className="w-3 h-3" /> Prochain RDV recommandÃ©</div>
            <div className="font-serif text-2xl text-[#0A192F]">
              {data.next_visit.days_until > 1
                ? `Dans ${data.next_visit.days_until} jours`
                : data.next_visit.days_until === 1
                ? "Demain"
                : data.next_visit.days_until === 0
                ? "Aujourd'hui"
                : `En retard de ${-data.next_visit.days_until} jour${-data.next_visit.days_until > 1 ? "s" : ""}`}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Vient tous les {data.next_visit.avg_frequency_days} jours (~{data.next_visit.avg_frequency_weeks} sem.) Â· suggÃ©rÃ© le {new Date(data.next_visit.next_recommended_date).toLocaleDateString("fr-FR")}
              {data.next_visit.usual_service_names?.length > 0 && <> Â· habitude : {data.next_visit.usual_service_names.join(" + ")}</>}
            </div>
          </div>
          <Link to={`/rdv/nouveau?client=${c.id}`} data-testid="next-visit-plan-btn" className="rounded-full px-5 py-2.5 bg-gold-gradient text-white text-sm flex items-center gap-2 shadow-premium flex-shrink-0 self-start md:self-center"><CalendarClock className="w-4 h-4" /> Planifier</Link>
        </div>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white border border-blue-100 rounded-2xl p-5"><div className="text-[10px] tracking-widest uppercase text-slate-500">RDV terminÃ©s</div><div className="font-serif text-2xl text-blue-600">{done.length}</div></div>
        <div className="bg-white border border-[#D4AF37]/30 rounded-2xl p-5"><div className="text-[10px] tracking-widest uppercase text-slate-500">Panier moyen</div><div className="font-serif text-2xl text-[#C5A059]">{money2(avg)} â‚¬</div></div>
        <div className="bg-white border border-green-100 rounded-2xl p-5"><div className="text-[10px] tracking-widest uppercase text-slate-500">Total encaissÃ©</div><div className="font-serif text-2xl text-green-700">{money2(total)} â‚¬</div></div>
        <div className="bg-white border border-pink-100 rounded-2xl p-5" data-testid="client-avg-duration"><div className="text-[10px] tracking-widest uppercase text-slate-500">Temps moyen</div><div className="font-serif text-2xl text-pink-600">{avgDuration} <span className="text-sm">min</span></div><div className="text-[10px] text-slate-500 mt-0.5">Total : {totalDuration} min</div></div>
        <div className="bg-white border border-red-100 rounded-2xl p-5" data-testid="client-cb-fees"><div className="text-[10px] tracking-widest uppercase text-slate-500">Frais CB ({(cbFeeRate * 100).toFixed(2).replace(".", ",")}%)</div><div className="font-serif text-2xl text-[#991B1B]">-{money2(cbFees)} â‚¬</div><div className="text-[10px] text-slate-500 mt-0.5">Net: {money2(netReceived)} â‚¬</div></div>
        <div className={`bg-white rounded-2xl p-5 ${cancelledCount > 0 || c.deposit_required ? "border-2 border-orange-300" : "border border-slate-100"}`} data-testid="client-noshow-card">
          <div className="text-[10px] tracking-widest uppercase text-slate-500">Annulations</div>
          <div className={`font-serif text-2xl ${cancelledCount > 0 ? "text-orange-600" : "text-slate-400"}`}>{cancelledCount}</div>
          {c.deposit_required && <div className="text-[10px] text-orange-700 mt-0.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Acompte requis</div>}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[{ id: "infos", l: "Informations" }, { id: "loyalty", l: "Suivi GratuitÃ©" }, { id: "parrainage", l: "Parrainage" }, { id: "history", l: "Historique" }, { id: "photos", l: "Photos" }, { id: "custom", l: "Champs personnalisÃ©s" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`} className={`px-4 py-2 rounded-full text-sm ${tab === t.id ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>{t.l}</button>
        ))}
      </div>

      {tab === "infos" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6 shadow-premium">
          <div className="md:col-span-2">
            <label className="text-[10px] tracking-widest uppercase text-slate-500">CivilitÃ©</label>
            <div className="flex gap-2 mt-2">
              {[{ v: "", l: "â€”" }, { v: "H", l: "M. (Homme)" }, { v: "F", l: "Mme (Femme)" }].map((g) => (
                <button key={g.v} type="button" onClick={() => setEditing({ ...editing, gender: g.v })} data-testid={`gender-${g.v || "none"}`} className={`px-4 py-2 rounded-full text-sm ${editing.gender === g.v ? (g.v === "H" ? "bg-blue-500 text-white" : g.v === "F" ? "bg-pink-500 text-white" : "bg-[#0A192F] text-white") : "border border-slate-200 text-slate-600"}`}>{g.l}</button>
              ))}
            </div>
          </div>
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">PrÃ©nom</label><input className={fb} value={editing.first_name} onChange={(e) => setEditing({ ...editing, first_name: e.target.value })} /></div>
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">Nom</label><input className={fb} value={editing.last_name} onChange={(e) => setEditing({ ...editing, last_name: e.target.value })} /></div>
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">TÃ©lÃ©phone</label><input className={fb} value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
          <div>
            <label className="text-[10px] tracking-widest uppercase text-slate-500">Anniversaire</label>
            <input type="date" className={fb} value={editing.birthday} onChange={(e) => setEditing({ ...editing, birthday: e.target.value })} />
            {computeAge(editing.birthday) !== null && <div className="text-xs text-slate-500 mt-1">{computeAge(editing.birthday)} ans</div>}
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-slate-500 mb-3">{c.address ? <>Adresse actuelle : <span className="text-slate-700">{c.address}</span></> : "Aucune adresse enregistrÃ©e."}</div>
            <AddressAutocomplete
              value={editing.address_parts}
              onChange={(parts, coords) => { setEditing({ ...editing, address_parts: parts }); setEditCoords(coords); }}
            />
          </div>
          <div className="md:col-span-2"><label className="text-[10px] tracking-widest uppercase text-slate-500">Commentaire permanent</label><textarea rows={3} className={`${fb} resize-none`} value={editing.comment} onChange={(e) => setEditing({ ...editing, comment: e.target.value })} /></div>
          <div>
            <label className="text-[10px] tracking-widest uppercase text-slate-500">Parrain</label>
            <select
              className={fb}
              data-testid="referred-by-select"
              value={editing.referred_by || ""}
              onChange={(e) => setEditing({ ...editing, referred_by: e.target.value })}
            >
              <option value="">â€” Aucun â€”</option>
              {allClients.filter((x) => x.id !== id).map((x) => (
                <option key={x.id} value={x.id}>{x.first_name} {x.last_name}</option>
              ))}
            </select>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1"><UsersIcon className="w-3 h-3" /> Le client qui vous a recommandÃ© Ã  cette personne</div>
          </div>
          <div className="md:col-span-2 bg-orange-50/50 border border-orange-100 rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={editing.deposit_required || false}
                onChange={(e) => setEditing({ ...editing, deposit_required: e.target.checked })}
                data-testid="deposit-required-toggle"
                className="w-4 h-4 accent-orange-600"
              />
              <span className="text-sm font-medium text-orange-900 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Acompte requis pour ce client</span>
            </label>
            {editing.deposit_required && (
              <div>
                <label className="text-[10px] tracking-widest uppercase text-slate-500">Note acompte (montant, versÃ© ou nonâ€¦)</label>
                <input className={fb} data-testid="deposit-note-input" value={editing.deposit_note || ""} onChange={(e) => setEditing({ ...editing, deposit_note: e.target.value })} placeholder="Ex : 10â‚¬ demandÃ©s, versÃ©s le 12/06" />
              </div>
            )}
            {cancelledCount > 0 && <div className="text-xs text-orange-700">{cancelledCount} annulation{cancelledCount > 1 ? "s" : ""} (no-show) enregistrÃ©e{cancelledCount > 1 ? "s" : ""} pour ce client.</div>}
          </div>
          <div className="md:col-span-2"><button onClick={save} data-testid="save-client-btn" className="bg-[#0A192F] text-white rounded-full px-6 py-3 font-medium flex items-center gap-2"><Save className="w-4 h-4" /> Enregistrer</button></div>
        </div>
      )}

      {tab === "loyalty" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium divide-y divide-slate-100">
          {(() => {
            const isChild = age !== null && age < 18;
            const filtered = services.filter((s) => {
              if (isChild) return s.category === "ENFANT";
              if (c.gender === "H") return s.category === "HOMME" || s.category === "AUTRE";
              if (c.gender === "F") return s.category === "FEMME" || s.category === "AUTRE";
              return true; // gender not set â†’ show all
            });
            if (filtered.length === 0) return <div className="text-slate-400 text-sm py-3">Aucune prestation pour cette catÃ©gorie.</div>;
            return filtered.map((s) => (
              <LoyaltyRow key={s.id} count={c.loyalty_counters?.[s.id] || 0} label={s.name} price={s.price} />
            ));
          })()}
        </div>
      )}

      {tab === "parrainage" && (() => {
        const ref = data.referral || {};
        const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
        return (
          <div className="space-y-4" data-testid="referral-tab">
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium space-y-4">
              <div className="flex items-center gap-2">
                <UsersIcon className="w-4 h-4 text-[#D4AF37]" />
                <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500">Parrainage</div>
              </div>
              {ref.referred_by_name && (
                <div className="text-sm" data-testid="referral-sponsor">
                  ParrainÃ© par{" "}
                  <Link to={`/clients/${ref.referred_by}`} className="font-medium text-[#1E3A8A] hover:underline">{ref.referred_by_name}</Link>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">Filleuls</div><div className="font-serif text-2xl text-[#0A192F]" data-testid="referral-count">{ref.godchildren_count || 0}</div></div>
                <div className="bg-[#D4AF37]/10 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">RÃ©compenses obtenues</div><div className="font-serif text-2xl text-[#C5A059]">{ref.rewards_earned || 0}</div></div>
                <div className="bg-green-50 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">Disponibles</div><div className="font-serif text-2xl text-green-700" data-testid="referral-available">{ref.rewards_available || 0}</div></div>
                <div className="bg-slate-50 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">UtilisÃ©es</div><div className="font-serif text-2xl text-slate-600">{ref.rewards_used || 0}</div></div>
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-[#D4AF37]" />
                Plus que {plural(ref.remaining_to_next ?? ref.threshold ?? 4, "filleul")} avant la prochaine coupe offerte ({ref.threshold || 4} filleuls = 1 coupe offerte).
              </div>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium">
              <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-3">Liste des filleuls</div>
              {(ref.godchildren || []).length === 0 ? (
                <div className="text-sm text-slate-400">Aucun filleul pour le moment. SÃ©lectionnez ce client comme Â« Parrain Â» sur la fiche d'un nouveau client.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {ref.godchildren.map((g, i) => (
                    <li key={g.id}>
                      <Link to={`/clients/${g.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80" data-testid={`godchild-${g.id}`}>
                        <span className="w-6 text-xs font-medium text-slate-400">#{i + 1}</span>
                        <span className="text-sm font-medium">{g.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {(ref.rewards_used_history || []).length > 0 && (
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium">
                <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-3">RÃ©compenses utilisÃ©es</div>
                <ul className="divide-y divide-slate-100">
                  {ref.rewards_used_history.map((u, i) => (
                    <li key={u.used_at || i} className="py-2.5 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2"><Gift className="w-3.5 h-3.5 text-[#C5A059]" /> {u.service_name || "Prestation offerte"}</span>
                      <span className="text-xs text-slate-500">{u.used_at ? new Date(u.used_at).toLocaleDateString("fr-FR") : "â€”"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })()}

      {tab === "history" && (
        <div className="space-y-2">
          {data.appointments.length === 0 ? <div className="text-slate-400 text-sm">Aucun historique.</div> :
            data.appointments.map((a) => {
              const isCB = a.status === "done" && a.payment_mode === "CB";
              const fee = isCB ? a.price_final * cbFeeRate : 0;
              return (
                <Link key={a.id} to={`/rdv/${a.id}`} className="block p-4 rounded-2xl border border-slate-100 bg-white hover:shadow-premium" data-testid={`history-rdv-${a.id}`}>
                  <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{fmtDate(a.date)} Â· {fmtTime(a.date)}{a.duration_minutes ? <span className="text-xs text-pink-600 ml-2">Â· {a.duration_minutes} min</span> : null}</div>
                    <div className="text-xs text-slate-500 truncate">{a.services.map(s => s.name + (s.is_gift ? " ðŸŽ" : "")).join(", ")}</div>
                    {isCB && <div className="text-[10px] text-[#991B1B] mt-0.5">Commission CB : -{money2(fee)} â‚¬ Â· Net {money2(a.price_final - fee)} â‚¬</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-serif text-lg">{money(a.price_final)}</div>
                    <div className="text-[10px] tracking-widest uppercase text-slate-400">{a.status === "done" ? a.payment_mode : a.status === "cancelled" ? "AnnulÃ©" : "PrÃ©vu"}</div>
                  </div>
                  </div>
                  {(a.product_usages || []).filter((usage) => usage.consumption_status !== "draft").length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100" data-testid={`formula-history-${a.id}`}>
                      <div className="text-[10px] tracking-widest uppercase text-[#8A6A1F] mb-2">Formule technique</div>
                      <div className="space-y-1.5">
                        {a.product_usages.filter((usage) => usage.consumption_status !== "draft").map((usage) => {
                          const product = usage.product_snapshot || {};
                          return (
                            <div key={usage.id} className="text-xs text-slate-600 flex flex-wrap gap-x-2">
                              <strong className="text-slate-800">{product.brand} Â· {product.range} {product.shadeCode || ""}</strong>
                              <span>{product.shadeName || product.productName}</span>
                              <span>Â· {Number(usage.used_stock_units).toLocaleString("fr-FR")} unitÃ©</span>
                              {usage.physical_amount ? <span>Â· {usage.physical_amount} {usage.physical_amount_unit}</span> : null}
                              {usage.technical_note ? <span className="w-full italic">{usage.technical_note}</span> : null}
                              {usage.consumption_status === "reversed" ? <span className="w-full text-red-700">Consommation annulÃ©e et stock restituÃ©</span> : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Link>
              );
            })
          }
        </div>
      )}

      {tab === "photos" && (
        <ClientPhotos clientId={c.id} clientName={`${c.first_name} ${c.last_name}`.trim()} />
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
            {Object.keys(c.custom_fields || {}).length === 0 && <li className="text-slate-400 text-sm py-3">Aucun champ personnalisÃ©.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
