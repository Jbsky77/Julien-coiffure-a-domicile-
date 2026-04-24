import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, money, money2, PAYMENT_MODES, fmtDate, fmtTime } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Gift, Send, Trash2, CheckCircle2, Pencil } from "lucide-react";

export default function AppointmentForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectClient = searchParams.get("client");
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({
    client_id: preselectClient || "",
    date: new Date().toISOString().slice(0, 16),
    services: [], // {service_id, is_gift}
    kilometrage: 0,
    notes: "",
    price_final_override: null,
  });
  const [rdv, setRdv] = useState(null);
  const [clientLoyalty, setClientLoyalty] = useState({});
  const [paymentMode, setPaymentMode] = useState("CB");
  const [duration, setDuration] = useState("");
  const [editMode, setEditMode] = useState(!id);
  const [preview, setPreview] = useState({ base: 0, fuel: 0, final: 0, family: false });

  const isDone = rdv?.status === "done";

  useEffect(() => {
    (async () => {
      const [c, s] = await Promise.all([api.get("/clients"), api.get("/services")]);
      setClients(c.data);
      setServices(s.data);
      if (id) {
        const r = await api.get("/appointments");
        const existing = r.data.find((x) => x.id === id);
        if (existing) {
          setRdv(existing);
          setForm({
            client_id: existing.client_id,
            date: existing.date.slice(0, 16),
            services: existing.services.map((x) => ({ service_id: x.service_id, is_gift: x.is_gift })),
            kilometrage: existing.kilometrage,
            notes: existing.notes,
            price_final_override: existing.price_final,
          });
          setPaymentMode(existing.payment_mode || "CB");
          setDuration(existing.duration_minutes || "");
          setEditMode(false);
        }
      }
    })();
  }, [id]);

  useEffect(() => {
    if (form.client_id) {
      (async () => {
        try {
          const r = await api.get(`/clients/${form.client_id}`);
          setClientLoyalty(r.data.client.loyalty_counters || {});
        } catch (e) {}
      })();
    }
  }, [form.client_id]);

  // Live preview
  useEffect(() => {
    const picked = form.services.map((fs) => services.find((s) => s.id === fs.service_id)).filter(Boolean);
    const nonGift = form.services.filter((s) => !s.is_gift).map((fs) => services.find((s) => s.id === fs.service_id)).filter(Boolean);
    let subtotal = nonGift.reduce((a, b) => a + b.price, 0);
    const cats = new Set(nonGift.map((x) => x.category));
    const family = ["HOMME", "FEMME", "ENFANT"].every((c) => cats.has(c));
    if (family) subtotal = 45;
    const fuel = Math.floor((form.kilometrage || 0) / 10) * 2.5;
    setPreview({ base: subtotal + fuel, fuel, final: form.price_final_override ?? subtotal + fuel, family });
  }, [form.services, form.kilometrage, form.price_final_override, services]);

  const toggleService = (sid) => {
    if (isDone) return;
    setForm((f) => {
      const exists = f.services.find((x) => x.service_id === sid);
      if (exists) return { ...f, services: f.services.filter((x) => x.service_id !== sid) };
      return { ...f, services: [...f.services, { service_id: sid, is_gift: false }] };
    });
  };

  const applyGift = (sid) => {
    setForm((f) => ({
      ...f,
      services: f.services.map((x) => x.service_id === sid ? { ...x, is_gift: !x.is_gift } : x),
    }));
  };

  const save = async () => {
    if (!form.client_id) return toast.error("Sélectionnez un client.");
    if (form.services.length === 0) return toast.error("Ajoutez au moins une prestation.");
    try {
      const payload = {
        ...form,
        date: new Date(form.date).toISOString(),
        price_final_override: form.price_final_override === "" ? null : form.price_final_override,
      };
      if (id) {
        await api.put(`/appointments/${id}`, payload);
        toast.success("Rendez-vous modifié");
      } else {
        await api.post("/appointments", payload);
        toast.success("Rendez-vous créé");
      }
      navigate("/rdv");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const finish = async () => {
    try {
      const payload = {
        payment_mode: paymentMode,
        price_final: form.price_final_override ?? preview.final,
        duration_minutes: duration === "" ? null : parseInt(duration),
      };
      await api.post(`/appointments/${id}/finish`, payload);
      toast.success("Paiement confirmé. Rendez-vous terminé.");
      navigate("/rdv");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const remove = async () => {
    if (!window.confirm("Supprimer ce rendez-vous ?")) return;
    await api.delete(`/appointments/${id}`);
    toast.success("Supprimé");
    navigate("/rdv");
  };

  const cancel = async () => {
    if (!window.confirm("Marquer ce rendez-vous comme annulé (no-show) ?")) return;
    await api.post(`/appointments/${id}/cancel`);
    toast.success("Rendez-vous annulé");
    navigate("/rdv");
  };

  // Build the RDV confirmation message (SMS/Email)
  const buildRdvMessage = () => {
    const client = clients.find((c) => c.id === form.client_id);
    const firstName = client?.first_name || client?.last_name || "";
    const dt = form.date ? new Date(form.date) : null;
    const jour = dt ? dt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
    const heure = dt ? dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h") : "";
    const amount = form.price_final_override ?? preview.final;
    const prestationsNames = form.services
      .map((fs) => services.find((s) => s.id === fs.service_id))
      .filter(Boolean)
      .map((s) => s.name)
      .join(" + ");
    const lines = [
      `Bonjour ${firstName},`,
      "",
      "C'est Julien, votre coiffeur.",
      `Je vous confirme votre rendez-vous du ${jour} à ${heure}.`,
      "",
    ];
    if (prestationsNames) lines.push(`Prestations : ${prestationsNames}`);
    lines.push(`Montant : ${Number(amount).toFixed(2).replace(".", ",")} €`);
    lines.push("", "À très vite,", "Julien Bouche");
    return lines.join("\n");
  };

  const buildLinks = () => {
    const client = clients.find((c) => c.id === form.client_id);
    const phone = client?.phone?.replace(/\s/g, "") || "";
    const msg = buildRdvMessage();
    return {
      sms: phone ? `sms:${phone}?body=${encodeURIComponent(msg)}` : null,
      mail: `mailto:?subject=${encodeURIComponent("Confirmation de votre rendez-vous")}&body=${encodeURIComponent(msg)}`,
    };
  };

  const fieldBase = "w-full bg-transparent border-b border-slate-300 rounded-none px-0 py-2 focus:border-[#0A192F] focus:outline-none text-base transition-colors";
  const readOnly = isDone || (id && !editMode);

  return (
    <div className="space-y-8 max-w-3xl" data-testid="rdv-form-page">
      <button onClick={() => navigate(-1)} className="text-sm text-slate-500 hover:text-[#0A192F] flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Retour</button>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">{id ? "Modifier" : "Nouveau"}</div>
          <h1 className="font-serif text-4xl tracking-tight">Rendez-vous</h1>
        </div>
        {id && !isDone && (
          <button onClick={() => setEditMode(!editMode)} data-testid="edit-mode-toggle" className="text-sm px-4 py-2 rounded-full border border-slate-200 flex items-center gap-2">
            <Pencil className="w-3.5 h-3.5" /> {editMode ? "Verrouiller" : "Modifier"}
          </button>
        )}
      </div>

      {isDone && <div className="bg-[#166534]/10 border border-[#166534]/30 rounded-2xl px-6 py-3 text-[#166534] text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Rendez-vous terminé — {rdv.payment_mode}</div>}
      {rdv?.status === "cancelled" && <div className="bg-red-50 border border-red-200 rounded-2xl px-6 py-3 text-[#991B1B] text-sm">Rendez-vous annulé (no-show)</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="text-[10px] tracking-widest uppercase text-slate-500">Client</label>
          <select disabled={readOnly} value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className={fieldBase} data-testid="rdv-client-select">
            <option value="">— Sélectionner —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] tracking-widest uppercase text-slate-500">Date & heure</label>
          <input disabled={readOnly} type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={fieldBase} data-testid="rdv-date-input" />
        </div>
      </div>

      <div>
        <label className="text-[10px] tracking-widest uppercase text-slate-500">Prestations</label>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {services.map((s) => {
            const picked = form.services.find((x) => x.service_id === s.id);
            const count = clientLoyalty[s.id] || 0;
            const giftEligible = count >= 5;
            return (
              <div key={s.id} className={`rounded-2xl border p-4 transition-all ${picked ? "border-[#0A192F] bg-slate-50" : "border-slate-200"}`}>
                <button disabled={readOnly} onClick={() => toggleService(s.id)} data-testid={`svc-toggle-${s.id}`} className="w-full text-left flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-slate-500">{s.category} · {money(s.price)}</div>
                  </div>
                  <div className="text-xs text-slate-400">{count}/5</div>
                </button>
                {picked && giftEligible && (
                  <button onClick={() => applyGift(s.id)} disabled={readOnly} data-testid={`apply-gift-${s.id}`} className={`mt-3 w-full text-xs flex items-center justify-center gap-2 px-3 py-2 rounded-full ${picked.is_gift ? "bg-gold-gradient text-white" : "border border-[#D4AF37] text-[#C5A059]"}`}>
                    <Gift className="w-3.5 h-3.5" /> {picked.is_gift ? "Gratuité appliquée" : "Appliquer gratuité (6ème offerte)"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="text-[10px] tracking-widest uppercase text-slate-500">Kilométrage</label>
          <input disabled={readOnly} type="number" step="0.1" value={form.kilometrage} onChange={(e) => setForm({ ...form, kilometrage: parseFloat(e.target.value) || 0 })} className={fieldBase} data-testid="rdv-km-input" />
          <div className="text-xs text-slate-500 mt-1">Supplément : {money(preview.fuel)} ({Math.floor((form.kilometrage || 0) / 10)} tranche(s))</div>
        </div>
        <div>
          <label className="text-[10px] tracking-widest uppercase text-slate-500">Prix final (écrasable)</label>
          <input disabled={readOnly} type="number" step="0.01" value={form.price_final_override ?? ""} placeholder={String(preview.base)} onChange={(e) => setForm({ ...form, price_final_override: e.target.value === "" ? null : parseFloat(e.target.value) })} className={fieldBase} data-testid="rdv-price-input" />
          {preview.family && <div className="text-xs text-[#C5A059] mt-1">✨ Pack Famille détecté — 45€</div>}
        </div>
      </div>

      <div>
        <label className="text-[10px] tracking-widest uppercase text-slate-500">Notes</label>
        <textarea disabled={readOnly} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${fieldBase} resize-none`} data-testid="rdv-notes-input" />
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-6 flex items-center justify-between shadow-premium">
        <div>
          <div className="text-[10px] tracking-widest uppercase text-slate-500">Total</div>
          <div className="font-serif text-4xl">{money(form.price_final_override ?? preview.base)}</div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Base : {money(preview.base - preview.fuel)}</div>
          <div>Carburant : {money(preview.fuel)}</div>
        </div>
      </div>

      {id && form.client_id && !isDone && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium space-y-3" data-testid="confirm-rdv-section">
          <div className="text-[10px] tracking-widest uppercase text-slate-500">Envoyer la confirmation au client</div>
          <div className="text-xs text-slate-500 italic whitespace-pre-line bg-slate-50 border border-slate-100 rounded-xl p-3 max-h-36 overflow-auto" data-testid="confirm-preview">
            {buildRdvMessage()}
          </div>
          <div className="flex flex-wrap gap-2">
            {(() => {
              const { sms, mail } = buildLinks();
              return (
                <>
                  {sms && <a href={sms} data-testid="send-confirm-sms" className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-sm hover:bg-slate-50"><Send className="w-4 h-4" /> SMS</a>}
                  <a href={mail} data-testid="send-confirm-email" className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-sm hover:bg-slate-50"><Send className="w-4 h-4" /> Email</a>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {!isDone && id && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium space-y-4">
          <div className="text-[10px] tracking-widest uppercase text-slate-500">Confirmer le paiement</div>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_MODES.map((p) => (
              <button key={p.id} onClick={() => setPaymentMode(p.id)} data-testid={`pm-${p.id}`} className={`px-4 py-2 rounded-full text-sm ${paymentMode === p.id ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div>
            <label className="text-[10px] tracking-widest uppercase text-slate-500">Temps passé (minutes)</label>
            <input type="number" min="0" step="5" data-testid="rdv-duration-input" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Ex : 45" className={fieldBase} />
            <div className="text-xs text-slate-500 mt-1">Enregistré à la validation du paiement (sera affiché dans la fiche client et les stats)</div>
          </div>
          <button onClick={finish} data-testid="finish-rdv-btn" className="w-full bg-gold-gradient text-white rounded-full px-8 py-4 font-medium flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Valider le paiement & terminer
          </button>
        </div>
      )}

      <div className="flex gap-3 items-center">
        {!isDone && (
          <button onClick={save} data-testid="save-rdv-btn" className="bg-[#0A192F] text-white rounded-full px-8 py-3 font-medium hover:bg-[#1E3A8A]">
            {id ? "Enregistrer les modifications" : "Créer le rendez-vous"}
          </button>
        )}
        {id && !isDone && rdv?.status !== "cancelled" && (
          <button onClick={cancel} data-testid="cancel-rdv-btn" className="rounded-full px-4 py-3 border border-red-200 text-[#991B1B] hover:bg-red-50 text-sm">Annuler (no-show)</button>
        )}
        {id && (
          <button onClick={remove} data-testid="delete-rdv-btn" className="rounded-full px-4 py-3 border border-red-200 text-[#991B1B] hover:bg-red-50 flex items-center gap-2">
            <Trash2 className="w-4 h-4" /> Supprimer
          </button>
        )}
      </div>
    </div>
  );
}
