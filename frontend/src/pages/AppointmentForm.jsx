import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { api, money, money2, PAYMENT_MODES, fmtDate, fmtTime } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Gift, Send, Trash2, CheckCircle2, Pencil, Sparkles, Clock, Repeat, AlertTriangle, UserRound, Timer, Play, Pause, Square, MapPin, Phone, MessageSquare } from "lucide-react";

const STYLISTS = ["Julien", "Marley"];

const isoToLocalInput = (iso) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

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
  const [clientRisk, setClientRisk] = useState(null);
  const [paymentMode, setPaymentMode] = useState("CB");
  const [duration, setDuration] = useState("");
  const [editMode, setEditMode] = useState(!id);
  const [preview, setPreview] = useState({ base: 0, fuel: 0, final: 0, family: false });
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [recurWeeks, setRecurWeeks] = useState(5);
  const [stylists, setStylists] = useState({}); // service_id -> "Julien" | "Marley"
  const [clientReferral, setClientReferral] = useState(null);
  const [useReferral, setUseReferral] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [confirmRestart, setConfirmRestart] = useState(false);
  // ---- Voisin / Déplacement automatisé ----
  const [travelInfo, setTravelInfo] = useState(null); // {distance_km, supplement, source, error}
  const [neighborOn, setNeighborOn] = useState(false);
  const [neighborId, setNeighborId] = useState(null);
  const [neighborSearch, setNeighborSearch] = useState("");
  const [neighborCheck, setNeighborCheck] = useState(null); // {valid, distance_km, discount, message, ...}
  const [checkingNeighbor, setCheckingNeighbor] = useState(false);
  const [serviceFilter, setServiceFilter] = useState("TOUS");
  const [serviceSearch, setServiceSearch] = useState("");

  const selectedClient = useMemo(() => clients.find((client) => client.id === form.client_id) || null, [clients, form.client_id]);
  const selectedGender = (selectedClient?.gender || "").toUpperCase();
  const isFamilyPack = (service) => /famille/i.test(service?.name || "") || (service?.category || "").toUpperCase() === "FAMILLE";
  const genderCompatibleServices = useMemo(() => services.filter((service) => {
    if (form.services.some((picked) => picked.service_id === service.id)) return true;
    if (isFamilyPack(service)) return true;
    const category = (service.category || "").toUpperCase();
    if (selectedGender === "H") return category === "HOMME";
    if (selectedGender === "F") return category === "FEMME";
    return true;
  }), [services, selectedGender, form.services]);
  const visibleServices = useMemo(() => genderCompatibleServices.filter((service) => {
    const category = (service.category || "").toUpperCase();
    const query = serviceSearch.trim().toLocaleLowerCase("fr-FR");
    const matchesSearch = !query || `${service.name} ${service.category}`.toLocaleLowerCase("fr-FR").includes(query);
    const matchesFilter = serviceFilter === "TOUS" || (serviceFilter === "FORFAITS" ? /forfait|pack/i.test(service.name || "") : category === serviceFilter);
    return matchesSearch && matchesFilter;
  }), [genderCompatibleServices, serviceFilter, serviceSearch]);

  const isDone = rdv?.status === "done";
  const timerStatus = rdv?.timer_status || (rdv?.started_at ? "running" : "idle");
  const timerRunning = timerStatus === "running" && !!rdv?.started_at;

  // Live timer tick
  useEffect(() => {
    if (!timerRunning || isDone) return;
    const iv = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [timerRunning, isDone]);

  const elapsedSecs = useMemo(() => {
    let total = rdv?.timer_seconds || 0;
    if (timerRunning) total += Math.max(0, (nowTick - new Date(rdv.started_at).getTime()) / 1000);
    return Math.floor(total);
  }, [nowTick, rdv?.started_at, rdv?.timer_seconds, timerRunning]);

  const elapsedLabel = useMemo(() => {
    const h = Math.floor(elapsedSecs / 3600), m = Math.floor((elapsedSecs % 3600) / 60), s = elapsedSecs % 60;
    return (h > 0 ? `${h}h ` : "") + `${String(m).padStart(2, "0")}min ${String(s).padStart(2, "0")}s`;
  }, [elapsedSecs]);

  const timerAction = async (action, msg) => {
    try {
      const r = await api.post(`/appointments/${id}/timer`, { action });
      setRdv((prev) => ({ ...prev, started_at: r.data.started_at, timer_seconds: r.data.timer_seconds, timer_status: r.data.timer_status }));
      setNowTick(Date.now());
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

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
            date: isoToLocalInput(existing.date),
            services: existing.services.map((x) => ({ service_id: x.service_id, is_gift: x.is_gift })),
            kilometrage: existing.kilometrage,
            notes: existing.notes,
            price_final_override: existing.price_final,
          });
          setStylists(Object.fromEntries(existing.services.map((x) => [x.service_id, x.stylist || "Julien"])));
          setPaymentMode(existing.payment_mode || "CB");
          setDuration(existing.duration_minutes || "");
          setNeighborOn(!!existing.is_neighbor);
          setNeighborId(existing.neighbor_of_client_id || null);
          if (existing.is_neighbor && existing.neighbor_distance_km !== null) {
            setNeighborCheck({
              valid: true,
              distance_km: existing.neighbor_distance_km,
              discount: existing.neighbor_discount,
              billed_supplement: 0,
              theoretical_supplement: existing.theoretical_fuel_supplement,
              neighbor: {
                id: existing.neighbor_of_client_id,
                first_name: (existing.neighbor_of_client_name || "").split(" ")[0] || "",
                last_name: (existing.neighbor_of_client_name || "").split(" ").slice(1).join(" "),
                address: existing.neighbor_of_client_address || "",
              },
              message: `Voisin validé — distance : ${existing.neighbor_distance_km?.toFixed(2)} km`.replace(".", ","),
            });
          }
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
          setClientReferral(r.data.referral || null);
          const cancelled = (r.data.appointments || []).filter((a) => a.status === "cancelled").length;
          setClientRisk({
            cancelled,
            deposit_required: !!r.data.client.deposit_required,
            deposit_note: r.data.client.deposit_note || "",
          });
        } catch (e) {
          console.warn("load client info:", e);
        }
        try {
          const t = await api.post("/travel/preview", { client_id: form.client_id });
          setTravelInfo(t.data);
        } catch {
          setTravelInfo(null);
        }
      })();
    } else {
      setClientRisk(null);
      setTravelInfo(null);
    }
  }, [form.client_id]);

  const runNeighborCheck = async (nid) => {
    if (!form.client_id || !nid) return;
    setCheckingNeighbor(true);
    try {
      const r = await api.post("/travel/neighbor-check", {
        client_id: form.client_id,
        neighbor_of_client_id: nid,
      });
      setNeighborCheck(r.data);
      if (r.data.valid) toast.success(r.data.message);
      else if (r.data.error === "same_client") toast.error(r.data.message);
      else if (r.data.error === "missing_coords") toast.error(r.data.message);
      else toast.info(r.data.message || "Voisinage refusé");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setCheckingNeighbor(false);
    }
  };

  // Live preview
  useEffect(() => {
    const nonGift = form.services.filter((s) => !s.is_gift).map((fs) => services.find((s) => s.id === fs.service_id)).filter(Boolean);
    let subtotal = nonGift.reduce((a, b) => a + b.price, 0);
    const cats = new Set(nonGift.map((x) => x.category));
    const family = ["HOMME", "FEMME", "ENFANT"].every((c) => cats.has(c));
    if (family) subtotal = 45;
    // Theoretical from geocoded distance if available, else manual km
    const theoretical = travelInfo?.supplement ?? Math.floor((form.kilometrage || 0) / 10) * 2.5;
    const isValidNeighbor = neighborOn && neighborCheck?.valid;
    const billed = isValidNeighbor ? 0 : theoretical;
    const discount = isValidNeighbor ? theoretical : 0;
    setPreview({
      base: subtotal + billed,
      fuel: billed,
      theoretical,
      discount,
      final: form.price_final_override ?? subtotal + billed,
      family,
    });
  }, [form.services, form.kilometrage, form.price_final_override, services, travelInfo, neighborOn, neighborCheck]);

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
        is_neighbor: neighborOn && !!neighborCheck?.valid,
        neighbor_of_client_id: neighborOn && neighborCheck?.valid ? neighborId : null,
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
      let useReward = useReferral;
      if (!useReward && clientReferral?.rewards_available > 0) {
        useReward = window.confirm("Ce client dispose d'une coupe offerte obtenue grâce au parrainage. Souhaitez-vous l'appliquer à cette prestation ?");
      }
      const payload = {
        payment_mode: paymentMode,
        price_final: form.price_final_override ?? preview.final,
        duration_minutes: duration === "" ? null : parseInt(duration),
        stylists: Object.fromEntries(form.services.map((fs) => [fs.service_id, stylists[fs.service_id] || "Julien"])),
        use_referral_reward: useReward,
      };
      await api.post(`/appointments/${id}/finish`, payload);
      toast.success(useReward ? "Coupe offerte appliquée. Rendez-vous terminé." : "Paiement confirmé. Rendez-vous terminé.");
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

  const fetchSlots = async () => {
    if (!form.client_id || !form.date) {
      toast.error("Choisissez un client et une date.");
      return;
    }
    setLoadingSlots(true);
    try {
      const dateOnly = form.date.slice(0, 10);
      const cli = await api.get(`/clients/${form.client_id}`);
      const c = cli.data.client;
      const r = await api.post("/slots/suggest", {
        date: dateOnly,
        service_ids: form.services.map((s) => s.service_id),
        lat: c.lat || null,
        lng: c.lng || null,
      });
      setSuggestions(r.data.suggestions || []);
      if ((r.data.suggestions || []).length === 0) toast.info("Aucun créneau disponible ce jour.");
    } catch (e) {
      toast.error("Erreur de suggestion");
    } finally {
      setLoadingSlots(false);
    }
  };

  const pickSlot = (iso) => {
    // Convert ISO to local datetime-local format YYYY-MM-DDTHH:MM
    const dt = new Date(iso);
    const tz = dt.getTimezoneOffset();
    const local = new Date(dt.getTime() - tz * 60000);
    setForm((f) => ({ ...f, date: local.toISOString().slice(0, 16) }));
    setSuggestions([]);
    toast.success("Créneau sélectionné");
  };

  const cancel = async () => {
    if (!window.confirm("Marquer ce rendez-vous comme annulé (no-show) ?")) return;
    await api.post(`/appointments/${id}/cancel`);
    toast.success("Rendez-vous annulé");
    navigate("/rdv");
  };

  const scheduleNext = async () => {
    try {
      const r = await api.post(`/appointments/${id}/schedule-next`, { weeks: recurWeeks });
      const d = new Date(r.data.date);
      toast.success(`Prochain RDV créé le ${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`);
      navigate(`/rdv/${r.data.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
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
    return lines.join("
");
  };

  const buildLinks = () => {
    const client = clients.find((c) => c.id === form.client_id);
    const phone = client?.phone_valid ? client.phone_normalized : "";
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

      {isDone && <div className="bg-[#166534]/10 border border-[#166534]/30 rounded-2xl px-6 py-3 text-[#166534] text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Rendez-vous terminé — {rdv.payment_mode}{rdv.duration_minutes ? ` · ${rdv.duration_minutes} min` : ""}{rdv.invoice_number ? ` · Facture ${rdv.invoice_number}` : ""}</div>}
      {rdv?.status === "cancelled" && <div className="bg-red-50 border border-red-200 rounded-2xl px-6 py-3 text-[#991B1B] text-sm">Rendez-vous annulé (no-show)</div>}

      {/* Timer: start manually on arrival, stops automatically at payment */}
      {id && rdv && !isDone && rdv.status !== "cancelled" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-premium space-y-4" data-testid="timer-card">
          {timerStatus === "idle" ? (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] tracking-widest uppercase text-slate-500 flex items-center gap-1.5"><Timer className="w-3.5 h-3.5 text-[#D4AF37]" /> Chronométrage</div>
                <div className="text-xs text-slate-500 mt-1">Démarrez en arrivant chez le client. Le chrono s'arrêtera automatiquement à l'encaissement.</div>
              </div>
              <button onClick={() => timerAction("start", "Chronomètre démarré")} data-testid="start-timer-btn" className="bg-[#0A192F] text-white rounded-full px-5 py-3 text-sm font-medium flex items-center gap-2 hover:bg-[#1E3A8A] flex-shrink-0">
                <Play className="w-4 h-4" /> Démarrer la prestation
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[10px] tracking-widest uppercase text-slate-500 flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5 text-[#D4AF37]" />
                    {timerStatus === "running" ? "Prestation en cours" : timerStatus === "paused" ? "Chronomètre en pause" : "Chronomètre arrêté"}
                    {timerStatus === "running" && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1" />}
                    {timerStatus === "paused" && <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 normal-case tracking-normal ml-1">Pause</span>}
                  </div>
                  <div className="font-serif text-3xl text-[#0A192F] tabular-nums mt-1" data-testid="timer-elapsed">{elapsedLabel}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {timerStatus === "stopped"
                      ? `Durée retenue : ${Math.max(1, Math.round(elapsedSecs / 60))} min — enregistrée à l'encaissement.`
                      : "Les pauses ne comptent pas dans le temps enregistré."}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {timerStatus === "running" && (
                  <>
                    <button onClick={() => timerAction("pause", "Chronomètre en pause")} data-testid="pause-timer-btn" className="flex-1 border border-amber-300 text-amber-700 rounded-full px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-amber-50">
                      <Pause className="w-4 h-4" /> Pause
                    </button>
                    <button onClick={() => timerAction("stop", "Chronomètre arrêté — durée retenue")} data-testid="stop-timer-btn" className="flex-1 border border-red-200 text-[#991B1B] rounded-full px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-red-50">
                      <Square className="w-3.5 h-3.5" /> Stop
                    </button>
                  </>
                )}
                {timerStatus === "paused" && (
                  <>
                    <button onClick={() => timerAction("resume", "Chronomètre relancé")} data-testid="resume-timer-btn" className="flex-1 bg-[#0A192F] text-white rounded-full px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#1E3A8A]">
                      <Play className="w-4 h-4" /> Reprendre
                    </button>
                    <button onClick={() => timerAction("stop", "Chronomètre arrêté — durée retenue")} data-testid="stop-timer-btn" className="flex-1 border border-red-200 text-[#991B1B] rounded-full px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:bg-red-50">
                      <Square className="w-3.5 h-3.5" /> Stop
                    </button>
                  </>
                )}
                {timerStatus === "stopped" && (
                  <button
                    onClick={() => {
                      if (!confirmRestart) {
                        setConfirmRestart(true);
                        setTimeout(() => setConfirmRestart(false), 4000);
                        return;
                      }
                      setConfirmRestart(false);
                      timerAction("start", "Chronomètre redémarré");
                    }}
                    data-testid="restart-timer-btn"
                    className={`flex-1 rounded-full px-4 py-2.5 text-sm flex items-center justify-center gap-2 border ${confirmRestart ? "border-red-300 bg-red-50 text-[#991B1B]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    <Play className="w-4 h-4" /> {confirmRestart ? "Confirmer — repartir de zéro" : "Redémarrer à zéro"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="text-[10px] tracking-widest uppercase text-slate-500">Client</label>
          <select
            disabled={readOnly}
            value={form.client_id}
            onChange={(e) => {
              setForm((current) => ({ ...current, client_id: e.target.value, services: [] }));
              setServiceFilter("TOUS");
              setServiceSearch("");
            }}
            className={fieldBase}
            data-testid="rdv-client-select"
          >
            <option value="">— Sélectionner —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
          </select>
          {form.client_id && (
            <Link
              to={`/clients/${form.client_id}`}
              data-testid="open-client-file-btn"
              className="mt-2 inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full border border-[#D4AF37]/50 text-[#8A6A1F] hover:bg-[#D4AF37]/10 transition"
            >
              <UserRound className="w-3.5 h-3.5" /> Fiche client
            </Link>
          )}
        </div>
        <div>
          <label className="text-[10px] tracking-widest uppercase text-slate-500">Date & heure</label>
          <input disabled={readOnly} type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={fieldBase} data-testid="rdv-date-input" />
        </div>
      </div>

      {/* Client contact info — visible sur la fiche RDV */}
      {(() => {
        const c = clients.find((x) => x.id === form.client_id);
        if (!c) return null;
        const hasContact = c.address || c.phone;
        if (!hasContact) return null;
        const fmtPhone = (p) => {
          const clean = (p || "").replace(/[\s.\-()]/g, "");
          return { display: p, tel: clean };
        };
        const ph = c.phone ? fmtPhone(c.phone) : null;
        const mapsUrl = c.address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.address)}` : null;
        return (
          <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-2" data-testid="client-contact-card">
            <div className="text-[10px] tracking-widest uppercase text-slate-500 mb-1">Contact client</div>
            {c.address && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="client-address-link"
                className="flex items-start gap-2 text-sm text-slate-700 hover:text-[#0A192F] transition"
              >
                <MapPin className="w-4 h-4 mt-0.5 text-[#D4AF37] flex-shrink-0" />
                <span className="underline decoration-dotted underline-offset-2">{c.address}</span>
              </a>
            )}
            {ph && (
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={`tel:${ph.tel}`}
                  data-testid="client-phone-call"
                  className="flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 text-sm hover:bg-emerald-100 transition"
                >
                  <Phone className="w-3.5 h-3.5" /> {ph.display}
                </a>
                <a
                  href={`sms:${ph.tel}`}
                  data-testid="client-phone-sms"
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 text-slate-600 px-3 py-1.5 text-xs hover:bg-slate-50 transition"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> SMS
                </a>
              </div>
            )}
          </div>
        );
      })()}

      {/* Client risk warning: no-shows / deposit */}
      {form.client_id && clientRisk && (clientRisk.cancelled > 0 || clientRisk.deposit_required) && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-3 text-sm text-orange-800 flex items-start gap-2.5" data-testid="client-risk-banner">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            {clientRisk.cancelled > 0 && <div>{clientRisk.cancelled} annulation{clientRisk.cancelled > 1 ? "s" : ""} (no-show) au compteur.</div>}
            {clientRisk.deposit_required && <div className="font-medium">Acompte requis pour ce client{clientRisk.deposit_note ? ` — ${clientRisk.deposit_note}` : ""}.</div>}
          </div>
        </div>
      )}

      {!readOnly && form.client_id && (
        <div className="bg-gradient-to-br from-[#D4AF37]/5 to-white border border-[#D4AF37]/30 rounded-2xl p-4 space-y-3" data-testid="smart-slots-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-slate-500 mb-0.5 flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-[#D4AF37]" /> Suggestions intelligentes</div>
              <div className="text-xs text-slate-600">
                Trouve les meilleurs créneaux selon la tournée et le trajet.
                {(() => {
                  const total = form.services.reduce((acc, fs) => {
                    const svc = services.find((s) => s.id === fs.service_id);
                    return acc + (svc?.duration_minutes || 0);
                  }, 0);
                  if (total > 0) return <span className="ml-1 text-[#C5A059]">Durée prévue : {total} min.</span>;
                  return <span className="ml-1 italic text-slate-400">Sélectionnez des prestations pour préciser la durée.</span>;
                })()}
              </div>
            </div>
            <button
              type="button"
              onClick={fetchSlots}
              disabled={loadingSlots}
              data-testid="suggest-slots-btn"
              className="bg-[#0A192F] text-white text-xs px-4 py-2 rounded-full whitespace-nowrap hover:bg-[#1E3A8A] disabled:opacity-50"
            >
              {loadingSlots ? "…" : "Suggérer"}
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickSlot(s.datetime)}
                  data-testid={`slot-pick-${i}`}
                  className="group flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-[#D4AF37] transition-colors text-left"
                >
                  <div className="flex items-center gap-1.5 font-medium text-sm">
                    <Clock className="w-3 h-3 text-[#1E3A8A]" /> {s.label}
                  </div>
                  <div className="text-[10px] text-slate-500">{s.reasons[0]}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="text-[10px] tracking-widest uppercase text-slate-500">Prestations</label>
        {selectedClient && (selectedGender === "H" || selectedGender === "F") && (
          <div className="mt-2 text-xs text-slate-500">Prestations adaptées à {selectedGender === "H" ? "un homme" : "une femme"}. Le pack famille reste toujours disponible.</div>
        )}
        <input type="search" value={serviceSearch} onChange={(e) => setServiceSearch(e.target.value)} placeholder="Rechercher une prestation…" aria-label="Rechercher une prestation" className={`${fieldBase} mt-3`} data-testid="service-search" />
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrer les prestations">
          {["TOUS", "HOMME", "FEMME", "ENFANT", "FORFAITS", "COULEUR", "MÈCHES"].map((filter) => (
            <button key={filter} type="button" onClick={() => setServiceFilter(filter)} aria-pressed={serviceFilter === filter} className={`px-3 py-1.5 rounded-full text-xs ${serviceFilter === filter ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>
              {filter === "TOUS" ? "Tous" : filter.charAt(0) + filter.slice(1).toLocaleLowerCase("fr-FR")}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visibleServices.map((s) => {
            const picked = form.services.find((x) => x.service_id === s.id);
            const count = clientLoyalty[s.id] || 0;
            const giftEligible = count >= 5;
            return (
              <div key={s.id} className={`rounded-2xl border p-4 transition-all ${picked ? "border-[#0A192F] bg-slate-50" : "border-slate-200"}`}>
                <button disabled={readOnly} onClick={() => toggleService(s.id)} data-testid={`svc-toggle-${s.id}`} className="w-full text-left flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-slate-500">{s.category} · {money(s.price)}{isDone && picked ? ` · par ${(rdv?.services.find((x) => x.service_id === s.id)?.stylist) || "Julien"}` : ""}</div>
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
        {visibleServices.length === 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500" data-testid="service-empty-state">
            Aucune prestation ne correspond à ce client et à ces filtres.
          </div>
        )}
      </div>

      {/* ---- Déplacement (auto + option Voisin) ---- */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-premium space-y-3" data-testid="travel-card">
        <div className="text-[10px] tracking-widest uppercase text-slate-500 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-[#D4AF37]" /> Déplacement</div>
        {travelInfo?.error === "business_address_not_geocoded" ? (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            L&apos;adresse professionnelle n&apos;est pas vérifiée. Rendez-vous dans Réglages → Adresse professionnelle pour la géocoder.
          </div>
        ) : travelInfo?.error === "client_address_not_geocoded" ? (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            L&apos;adresse du client n&apos;est pas géocodée. Ouvrez sa fiche pour la corriger.
          </div>
        ) : travelInfo && travelInfo.distance_km !== null ? (
          <div className="text-sm text-slate-600" data-testid="travel-info">
            Distance depuis l&apos;adresse pro : <span className="font-medium">{travelInfo.distance_km.toFixed(2).replace(".", ",")} km</span>
            {" — "}Supplément théorique : <span className="font-medium">{money(preview.theoretical)}</span>
          </div>
        ) : (
          <div className="text-xs text-slate-500">Calcul de la distance…</div>
        )}
        {/* Toggle Voisin */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={readOnly}
            onClick={() => { setNeighborOn(!neighborOn); if (neighborOn) { setNeighborId(null); setNeighborCheck(null); } }}
            data-testid="neighbor-toggle"
            role="switch"
            aria-checked={neighborOn}
            aria-label={neighborOn ? "Désactiver l'option Voisin" : "Activer l'option Voisin"}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${neighborOn ? "bg-[#D4AF37]" : "bg-slate-200"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${neighborOn ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <div className="text-sm">
            <div className="font-medium">Voisin</div>
            <div className="text-xs text-slate-500">Exonération si &lt; 1 km d&apos;un autre client</div>
          </div>
        </div>
        {neighborOn && (
          <div className="space-y-2" data-testid="neighbor-picker">
            <label className="text-[10px] tracking-widest uppercase text-slate-500">De quel client est-il voisin ?</label>
            <input
              type="text"
              placeholder="Nom, prénom, téléphone, commune…"
              value={neighborSearch}
              onChange={(e) => setNeighborSearch(e.target.value)}
              data-testid="neighbor-search-input"
              className={fieldBase}
            />
            {neighborSearch && (
              <div className="max-h-40 overflow-auto rounded-xl border border-slate-100 divide-y divide-slate-100">
                {clients
                  .filter((c) => c.id !== form.client_id)
                  .filter((c) => {
                    const q = neighborSearch.toLowerCase();
                    return [c.first_name, c.last_name, c.phone, c.address].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
                  })
                  .slice(0, 8)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      data-testid={`neighbor-option-${c.id}`}
                      onClick={() => { setNeighborId(c.id); setNeighborSearch(`${c.first_name} ${c.last_name}`); runNeighborCheck(c.id); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <div className="font-medium">{c.first_name} {c.last_name}</div>
                      <div className="text-xs text-slate-500">{c.address || "— pas d'adresse —"}</div>
                    </button>
                  ))}
              </div>
            )}
            {checkingNeighbor && <div className="text-xs text-slate-500">Vérification en cours…</div>}
            {neighborCheck && (
              <div
                data-testid="neighbor-result"
                className={`text-sm rounded-xl px-3 py-2 border ${neighborCheck.valid ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-[#991B1B]"}`}
              >
                {neighborCheck.message}
                {neighborCheck.valid && (
                  <div className="text-xs text-emerald-700 mt-1">
                    Remise voisin : −{money(neighborCheck.discount || 0)} · Supplément facturé : {money(0)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
          {preview.discount > 0 ? (
            <>
              <div className="line-through text-slate-400">Supplément théorique : {money(preview.theoretical)}</div>
              <div className="text-[#166534]">Remise voisin : −{money(preview.discount)}</div>
            </>
          ) : (
            <div>Déplacement : {money(preview.fuel)}</div>
          )}
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
          {clientReferral?.rewards_available > 0 && (
            <div className="bg-gradient-to-r from-[#D4AF37]/10 to-white border border-[#D4AF37]/40 rounded-xl p-4 space-y-3" data-testid="referral-reward-banner">
              <div className="text-sm text-[#8A6A1F] flex items-start gap-2">
                <Gift className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Ce client dispose de <strong>{clientReferral.rewards_available} coupe{clientReferral.rewards_available > 1 ? "s" : ""} offerte{clientReferral.rewards_available > 1 ? "s" : ""}</strong> grâce au parrainage ({clientReferral.godchildren_count} filleul{clientReferral.godchildren_count > 1 ? "s" : ""}).</span>
              </div>
              <button
                type="button"
                onClick={() => setUseReferral((v) => !v)}
                data-testid="use-referral-toggle"
                className={`w-full text-xs flex items-center justify-center gap-2 px-3 py-2.5 rounded-full ${useReferral ? "bg-gold-gradient text-white shadow-premium" : "border border-[#D4AF37] text-[#C5A059]"}`}
              >
                <Gift className="w-3.5 h-3.5" /> {useReferral ? "Coupe offerte appliquée (prestation la plus chère)" : "Appliquer la coupe offerte"}
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {PAYMENT_MODES.map((p) => (
              <button key={p.id} onClick={() => setPaymentMode(p.id)} data-testid={`pm-${p.id}`} className={`px-4 py-2 rounded-full text-sm ${paymentMode === p.id ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>
                {p.label}
              </button>
            ))}
          </div>
          {form.services.length > 0 && (
            <div data-testid="stylist-section">
              <label className="text-[10px] tracking-widest uppercase text-slate-500">Qui a réalisé chaque prestation ?</label>
              <ul className="mt-2 space-y-2">
                {form.services.map((fs) => {
                  const svc = services.find((s) => s.id === fs.service_id);
                  if (!svc) return null;
                  const current = stylists[fs.service_id] || "Julien";
                  return (
                    <li key={fs.service_id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-4 py-2.5">
                      <span className="text-sm font-medium truncate">{svc.name}</span>
                      <div className="flex gap-1.5 flex-shrink-0">
                        {STYLISTS.map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setStylists((prev) => ({ ...prev, [fs.service_id]: st }))}
                            data-testid={`stylist-${fs.service_id}-${st}`}
                            className={`px-3 py-1.5 rounded-full text-xs ${current === st ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div>
            <label className="text-[10px] tracking-widest uppercase text-slate-500">Temps passé (minutes)</label>
            <input type="number" min="0" step="5" data-testid="rdv-duration-input" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder={timerStatus !== "idle" ? "Auto (chronomètre)" : "Ex : 45"} className={fieldBase} />
            <div className="text-xs text-slate-500 mt-1">{timerStatus !== "idle" ? "Laissez vide : la durée du chronomètre sera enregistrée automatiquement." : "Enregistré à la validation du paiement (sera affiché dans la fiche client et les stats)"}</div>
          </div>
          <button onClick={finish} data-testid="finish-rdv-btn" className="w-full bg-gold-gradient text-white rounded-full px-8 py-4 font-medium flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Valider le paiement & terminer
          </button>
        </div>
      )}

      {/* Recurrence: schedule the next appointment */}
      {id && rdv && rdv.status !== "cancelled" && (
        <div className="bg-gradient-to-br from-[#D4AF37]/5 to-white border border-[#D4AF37]/30 rounded-2xl p-6 space-y-4" data-testid="recurrence-section">
          <div>
            <div className="text-[10px] tracking-widest uppercase text-slate-500 flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5 text-[#D4AF37]" /> Programmer le prochain RDV</div>
            <div className="text-xs text-slate-500 mt-1">Même client, mêmes prestations, même heure — dans :</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[4, 5, 6].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setRecurWeeks(w)}
                data-testid={`recur-weeks-${w}`}
                className={`px-4 py-2 rounded-full text-sm ${recurWeeks === w ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}
              >
                {w} semaines
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-sm text-slate-600 ml-1">
              <input
                type="number" min="1" max="26"
                value={recurWeeks}
                onChange={(e) => setRecurWeeks(Math.min(26, Math.max(1, parseInt(e.target.value) || 1)))}
                data-testid="recur-weeks-input"
                className="w-14 text-center bg-transparent border-b border-slate-300 py-1 focus:border-[#0A192F] focus:outline-none"
              />
              sem.
            </label>
          </div>
          <button onClick={scheduleNext} data-testid="recur-create-btn" className="w-full border border-[#D4AF37] text-[#8A6A1F] rounded-full px-6 py-3 text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#D4AF37]/10">
            <Repeat className="w-4 h-4" /> Créer le RDV du {(() => {
              const base = form.date ? new Date(form.date) : new Date();
              const next = new Date(base.getTime() + recurWeeks * 7 * 86400000);
              return next.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
            })()}
          </button>
        </div>
      )}

      <div className="flex gap-3 items-center">
        {!isDone && (
          <button
            onClick={save}
            disabled={form.services.length === 0}
            data-testid="save-rdv-btn"
            className="bg-[#0A192F] text-white rounded-full px-8 py-3 font-medium hover:bg-[#1E3A8A] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            {form.services.length === 0 ? "Sélectionnez une prestation" : id ? "Enregistrer les modifications" : "Créer le rendez-vous"}
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
