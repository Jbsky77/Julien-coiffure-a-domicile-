import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/lib/api";
import { Bell, Calendar, Star, Gift, Scissors, ClipboardList, MessageSquare, Check, X, Sparkles, Clock, Award, Receipt, Download, Users, Share2 } from "lucide-react";
import { toast, Toaster } from "sonner";
import ClientChat from "@/components/app/ClientChat";

const money = (v) => (Math.round((v || 0) * 100) / 100).toFixed(2);
const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
};

const PAYMENT_LABELS = { CB: "Carte bancaire", CHEQUE: "Chèque", ESPECES: "Espèces", VIREMENT: "Virement" };

export default function ClientSpace() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("fidelite"); // "fidelite" | "historique" | "rdv"

  const [form, setForm] = useState({ requested_date: "", service_ids: [], comment: "" });
  const [availableSvc, setAvailableSvc] = useState([]);
  const [sending, setSending] = useState(false);
  const [altOpen, setAltOpen] = useState(false);
  const [altDate, setAltDate] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, svc] = await Promise.all([
        axios.get(`${API}/public/client/${token}`),
        axios.get(`${API}/public/client/${token}/services`),
      ]);
      const fresh = r.data;
      setData((prev) => ({
        ...fresh,
        notifications: (fresh.notifications?.length ? fresh.notifications : prev?.notifications) || [],
      }));
      setAvailableSvc(svc.data);
      // Mark as read: they stay visible this session, gone at next visit
      axios.post(`${API}/public/client/${token}/notifications/read`).catch(() => {});
    } catch (e) {
      setError(e.response?.data?.detail || "Lien invalide");
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const submitRequest = async () => {
    if (!form.requested_date) return toast.error("Choisissez une date et une heure");
    if (form.service_ids.length === 0) return toast.error("Sélectionnez au moins une prestation");
    setSending(true);
    try {
      await axios.post(`${API}/public/client/${token}/appointment-requests`, {
        requested_date: new Date(form.requested_date).toISOString(),
        service_ids: form.service_ids,
        comment: form.comment,
      });
      toast.success("Demande envoyée !");
      setForm({ requested_date: "", service_ids: [], comment: "" });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSending(false);
    }
  };

  const respondCounter = async (rid, decision, newDate = null) => {
    try {
      await axios.post(`${API}/public/client/${token}/appointment-requests/${rid}/respond`, {
        decision,
        requested_date: newDate ? new Date(newDate).toISOString() : null,
      });
      toast.success(decision === "accept" ? "Rendez-vous confirmé !" : "Nouvelle date envoyée");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const dismissNotifs = async () => {
    try {
      await axios.post(`${API}/public/client/${token}/notifications/dismiss`);
      setData((prev) => ({ ...prev, notifications: [] }));
    } catch (e) {
      console.warn("dismiss notifications:", e);
    }
  };

  const totalDuration = useMemo(() => {
    return form.service_ids.reduce((acc, id) => {
      const s = availableSvc.find((x) => x.id === id);
      return acc + (s?.duration_minutes || 0);
    }, 0);
  }, [form.service_ids, availableSvc]);

  const shareReferral = async () => {
    const firstName = data?.client?.first_name || "";
    const brandName = data?.brand?.name || "Mon entreprise";
    const msg = `Salut, je te recommande ${brandName}, coiffeur à domicile ! Prestation vraiment top. Contacte-le au 07 44 42 64 62 pour prendre RDV. Dis-lui que ${firstName} t'envoie 😉`;
    // Try native share first (best on mobile PWA)
    if (navigator.share) {
      try {
        await navigator.share({ title: brandName, text: msg });
        return;
      } catch {
        // user cancelled or share failed — fall back to sms:
      }
    }
    // Fallback: sms: URL scheme (opens native SMS composer)
    const encoded = encodeURIComponent(msg);
    // iOS uses "sms:&body=", Android uses "sms:?body="
    const ua = navigator.userAgent || "";
    const url = /iPhone|iPad|iPod/i.test(ua) ? `sms:&body=${encoded}` : `sms:?body=${encoded}`;
    window.location.href = url;
  };

  if (error) return <ErrorScreen msg={error} />;
  if (!data) return <LoadingScreen />;

  const { client, appointments, requests, loyalty, notifications, brand, invoices, referral } = data;
  const isFemale = ["femme", "female", "féminin", "feminin", "f"].includes(
    String(client.gender || "").trim().toLowerCase()
  );
  const reviewLink = brand.review_url_short || brand.review_url || `https://www.google.com/search?q=${encodeURIComponent((brand.name || "Mon entreprise") + " coiffure avis")}`;
  const activeCounter = requests.find((r) => r.status === "counter_proposed");
  const doneAppointments = appointments.filter((a) => a.status === "done");
  const upcomingAppointments = appointments
    .filter((a) => a.status === "scheduled" && new Date(a.date) >= new Date(Date.now() - 3600 * 1000))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <Toaster position="top-center" richColors closeButton />
      {/* Header hero */}
      <header className={`${isFemale ? "bg-gradient-to-br from-[#EC4899] via-[#DB2777] to-[#BE185D]" : "bg-[#0A192F]"} text-white px-5 pt-8 pb-16 relative overflow-hidden`}>
        <div className="absolute inset-0 opacity-10" style={{
          background: "radial-gradient(circle at 30% 20%, #D4AF37 0%, transparent 40%)",
        }} />
        <div className="relative max-w-2xl mx-auto">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-white/50 mb-3">
            <Scissors className="w-3.5 h-3.5 text-[#D4AF37]" /> {brand.name}
          </div>
          <h1 className="font-serif text-4xl leading-tight" data-testid="client-space-title">
            Bonjour {client.first_name || client.last_name} 👋
          </h1>
          <p className="text-white/70 text-sm mt-2">Votre espace personnel — fidélité, historique et demandes de rendez-vous.</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 -mt-10 relative pb-16 space-y-6">
        {/* Notifications */}
        {notifications && notifications.length > 0 && (
          <section className="bg-white border border-[#D4AF37]/30 rounded-3xl p-5 shadow-lg" data-testid="client-notifications">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#D4AF37]" />
                <h2 className="text-sm font-semibold tracking-wide">Notifications</h2>
              </div>
              <button
                onClick={dismissNotifs}
                data-testid="dismiss-notifications-btn"
                aria-label="Fermer les notifications"
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="space-y-2">
              {notifications.slice(0, 5).map((n, i) => (
                <li key={n.id || i} className="text-sm text-slate-700 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] mt-2 flex-shrink-0" />
                  <div>
                    <div>{n.message}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{fmtDate(n.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Counter-proposal alert */}
        {activeCounter && (
          <section className="bg-gradient-to-br from-[#D4AF37]/10 to-white border border-[#D4AF37]/50 rounded-3xl p-5 shadow-premium" data-testid="counter-proposal-card">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#8A6A1F] mb-2">Nouveau créneau proposé</div>
            <div className="font-serif text-2xl mb-1">{fmtDate(activeCounter.counter_proposed_date)}</div>
            {activeCounter.admin_note && <div className="text-sm text-slate-600 italic">« {activeCounter.admin_note} »</div>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => respondCounter(activeCounter.id, "accept")} data-testid="accept-counter-btn" className="flex-1 bg-[#0A192F] text-white rounded-full px-4 py-2.5 text-sm flex items-center justify-center gap-2 hover:bg-[#1E3A8A]"><Check className="w-4 h-4" /> Accepter</button>
              <button onClick={() => setAltOpen((v) => !v)} data-testid="reject-counter-btn" className="flex-1 border border-slate-200 rounded-full px-4 py-2.5 text-sm flex items-center justify-center gap-2 text-slate-600 hover:bg-slate-50"><X className="w-4 h-4" /> Autre date</button>
            </div>
            {altOpen && (
              <div className="mt-3 bg-white border border-slate-100 rounded-xl p-4 space-y-3" data-testid="alt-date-form">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500">Quelle date vous conviendrait ?</label>
                  <input
                    type="datetime-local"
                    data-testid="alt-date-input"
                    value={altDate}
                    onChange={(e) => setAltDate(e.target.value)}
                    className="w-full bg-transparent border-b border-slate-200 py-2 focus:border-[#0A192F] focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => {
                    if (!altDate) return toast.error("Choisissez une date");
                    respondCounter(activeCounter.id, "reject", altDate);
                    setAltOpen(false);
                    setAltDate("");
                  }}
                  data-testid="alt-date-send-btn"
                  className="w-full bg-[#0A192F] text-white rounded-full px-4 py-2.5 text-sm"
                >
                  Envoyer ma proposition
                </button>
              </div>
            )}
          </section>
        )}

        {/* Upcoming appointments */}
        {upcomingAppointments.length > 0 && (
          <section className="bg-white border border-blue-100 rounded-3xl p-5 shadow-premium" data-testid="upcoming-appointments">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#1E3A8A] mb-3 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Vos prochains rendez-vous
            </div>
            <ul className="space-y-3">
              {upcomingAppointments.map((a) => (
                <li key={a.id} data-testid={`upcoming-rdv-${a.id}`} className="flex items-start justify-between gap-3 bg-gradient-to-r from-blue-50/60 to-white border border-blue-100/60 rounded-2xl p-4">
                  <div>
                    <div className="font-serif text-lg text-[#0A192F] capitalize">{fmtDate(a.date)}</div>
                    {a.services?.length > 0 && (
                      <div className="text-xs text-slate-500 mt-1">{a.services.map((s) => s.name).join(" · ")}</div>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-[10px] px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium flex items-center gap-1">
                    <Check className="w-3 h-3" /> Confirmé
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Tabs */}
        <div className="grid grid-cols-5 gap-1 bg-white rounded-2xl p-1.5 shadow-sm">
          {[
            { id: "fidelite", label: "Fidélité", icon: Star },
            { id: "historique", label: "Historique", icon: ClipboardList },
            { id: "factures", label: "Factures", icon: Receipt },
            { id: "rdv", label: "RDV", icon: Sparkles },
            { id: "messages", label: "Messages", icon: MessageSquare },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              data-testid={`tab-${t.id}`}
              className={`min-w-0 flex flex-col items-center justify-center gap-1 px-1 py-2.5 rounded-xl text-[11px] sm:text-xs font-medium transition ${
                tab === t.id ? "bg-[#0A192F] text-white" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <t.icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate w-full text-center">{t.label}</span>
            </button>
          ))}
        </div>

        {tab === "fidelite" && (
          <section className="space-y-4">
            {/* Loyalty summary card */}
            <div className={`bg-gradient-to-br ${isFemale ? "from-[#EC4899] via-[#DB2777] to-[#BE185D]" : "from-[#0A192F] to-[#1E3A8A]"} text-white rounded-3xl p-6 shadow-premium`} data-testid="loyalty-summary">
              <div className="text-[10px] tracking-[0.3em] uppercase text-white/60 mb-2">Carte de fidélité</div>
              <div className="flex items-baseline gap-6">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/60">Prestations payées</div>
                  <div className="font-serif text-4xl mt-1">{loyalty.total_visits}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/60">Récompenses</div>
                  <div className="font-serif text-4xl text-[#D4AF37] mt-1">{loyalty.total_rewards}</div>
                </div>
              </div>
              <div className="text-xs text-white/70 mt-4 flex items-center gap-1.5"><Gift className="w-3.5 h-3.5 text-[#D4AF37]" /> 5 payées = 1 offerte, par prestation</div>
            </div>

            {/* Loyalty details per service */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
              <h3 className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-3">Prestations engagées</h3>
              {loyalty.rows.filter((r) => r.count > 0).length === 0 ? (
                <div className="text-sm text-slate-500 py-4 text-center">Pas encore de visite enregistrée. À bientôt !</div>
              ) : (
                <ul className="space-y-3">
                  {loyalty.rows.filter((r) => r.count > 0).map((r) => (
                    <li key={r.service_id} data-testid={`loyalty-row-${r.service_id}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-sm font-medium">{r.name}</div>
                        <div className="text-xs text-slate-500">
                          {r.remaining === 0 ? (
                            <span className="text-[#D4AF37] font-semibold flex items-center gap-1"><Award className="w-3 h-3" /> Récompense disponible</span>
                          ) : (
                            `${r.remaining} avant récompense`
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {Array.from({ length: loyalty.target_per_reward }).map((_, i) => (
                          <div
                            key={i}
                            className={`flex-1 h-2 rounded-full ${i < r.current ? "bg-[#D4AF37]" : "bg-slate-200"}`}
                          />
                        ))}
                      </div>
                      {r.cycles > 0 && <div className="text-[10px] text-slate-500 mt-1">{r.cycles} récompense{r.cycles > 1 ? "s" : ""} accumulée{r.cycles > 1 ? "s" : ""}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Referral (parrainage) */}
            {referral?.referred_by && (
              <div className="bg-white border border-[#D4AF37]/30 rounded-3xl p-5 shadow-sm" data-testid="referral-child-card">
                <div className="text-[10px] tracking-[0.3em] uppercase text-[#8A6A1F] mb-2 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Filleul
                </div>
                <div className="text-sm text-slate-600">
                  Vous avez été recommandé(e) par <span className="font-semibold text-[#0A192F]">{referral.referred_by_name || "votre parrain"}</span>.
                </div>
              </div>
            )}
            {referral && !referral.referred_by && (
              <div className="bg-white border border-[#D4AF37]/30 rounded-3xl p-5 shadow-sm space-y-4" data-testid="referral-card">
                <div className="text-[10px] tracking-[0.3em] uppercase text-[#8A6A1F] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Parrainage
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 rounded-2xl p-3">
                    <div className="font-serif text-2xl text-[#0A192F]" data-testid="referral-godchildren">{referral.godchildren_count}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">Filleul{referral.godchildren_count > 1 ? "s" : ""}</div>
                  </div>
                  <div className="bg-[#D4AF37]/10 rounded-2xl p-3">
                    <div className="font-serif text-2xl text-[#C5A059]" data-testid="referral-rewards-available">{referral.rewards_available}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">Offerte{referral.rewards_available > 1 ? "s" : ""} dispo</div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-3">
                    <div className="font-serif text-2xl text-slate-500">{referral.rewards_used}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">Utilisée{referral.rewards_used > 1 ? "s" : ""}</div>
                  </div>
                </div>
                {referral.rewards_available > 0 ? (
                  <div className="text-sm text-[#8A6A1F] bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl px-4 py-3 flex items-center gap-2">
                    <Gift className="w-4 h-4 flex-shrink-0" /> Une coupe offerte vous attend lors de votre prochain rendez-vous !
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">
                    Plus que <span className="font-semibold text-[#0A192F]">{referral.remaining_to_next}</span> recommandation{referral.remaining_to_next > 1 ? "s" : ""} avant votre prochaine coupe offerte.
                  </div>
                )}
                {referral.godchildren?.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5">Vos filleuls</div>
                    <div className="flex flex-wrap gap-1.5">
                      {referral.godchildren.map((g) => (
                        <span key={g.id} className="text-xs px-2.5 py-1 rounded-full bg-slate-50 border border-slate-100 text-slate-600">{g.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={shareReferral}
                  data-testid="referral-share-btn"
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#D4AF37] to-[#C5A059] text-white rounded-full px-5 py-3 text-sm font-medium shadow-premium hover:shadow-lg transition"
                >
                  <Share2 className="w-4 h-4" /> Recommander à un ami
                </button>
                <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-3">
                  « Recommandez mon service à votre entourage. Toutes les {referral.threshold} recommandations devenues clientes, profitez d'une coupe offerte en remerciement de votre confiance. »
                </p>
              </div>
            )}

            {/* Google Review CTA */}
            {reviewLink && (
              <a
                href={reviewLink}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="review-btn"
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#D4AF37] to-[#C5A059] text-white rounded-full px-5 py-3.5 font-medium shadow-premium hover:shadow-lg transition"
              >
                <Star className="w-4 h-4 fill-current" /> Laisser un avis sur Google
              </a>
            )}
          </section>
        )}

        {tab === "historique" && (
          <section className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100" data-testid="history-section">
            <h3 className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-3">Historique des rendez-vous</h3>
            {doneAppointments.length === 0 ? (
              <div className="text-sm text-slate-500 py-4 text-center">Aucun rendez-vous terminé pour le moment.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {doneAppointments.map((a) => (
                  <li key={a.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{fmtDate(a.date)}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{a.services.map((s) => s.name).join(" · ")}</div>
                      </div>
                      <div className="text-sm font-semibold text-[#0A192F]">{money(a.price_final)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "factures" && (
          <section className="space-y-4" data-testid="invoices-section">
            {(!invoices || invoices.length === 0) ? (
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 text-sm text-slate-500 text-center">Aucune facture pour le moment.</div>
            ) : (
              invoices.map((inv) => (
                <div key={inv.id} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100" data-testid={`invoice-${inv.id}`}>
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <div className="text-[10px] tracking-[0.25em] uppercase text-[#8A6A1F] flex items-center gap-1.5">
                        <Receipt className="w-3 h-3" /> {inv.invoice_number || "Facture"}
                      </div>
                      <div className="font-medium text-sm mt-1">{fmtDate(inv.date)}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-serif text-2xl text-[#0A192F]">{money(inv.price_final)}</div>
                      {inv.payment_mode && <div className="text-[10px] text-slate-400">{PAYMENT_LABELS[inv.payment_mode] || inv.payment_mode}</div>}
                    </div>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {inv.services.map((s, i) => (
                      <li key={i} className="flex items-center justify-between text-sm">
                        <div>
                          <span>{s.name}</span>
                          <span className="text-xs text-slate-400 ml-2">par {s.stylist}</span>
                        </div>
                        {s.is_gift ? (
                          <span className="text-xs text-[#C5A059] font-medium flex items-center gap-1"><Gift className="w-3 h-3" /> Offerte</span>
                        ) : (
                          <span className="text-slate-600">{money(s.price)}</span>
                        )}
                      </li>
                    ))}
                    {inv.fuel_supplement > 0 && (
                      <li className="flex items-center justify-between text-sm text-slate-500">
                        <span>Supplément déplacement</span>
                        <span>{money(inv.fuel_supplement)}</span>
                      </li>
                    )}
                  </ul>
                  <a
                    href={`${API}/public/client/${token}/invoices/${inv.id}/pdf`}
                    download
                    data-testid={`invoice-pdf-${inv.id}`}
                    className="mt-4 w-full flex items-center justify-center gap-2 border border-[#D4AF37]/50 text-[#8A6A1F] rounded-full px-4 py-2.5 text-sm font-medium hover:bg-[#D4AF37]/10 transition"
                  >
                    <Download className="w-4 h-4" /> Télécharger en PDF
                  </a>
                </div>
              ))
            )}
          </section>
        )}

        {tab === "rdv" && (
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4" data-testid="request-form">
            <div>
              <h3 className="font-serif text-2xl">Demander un rendez-vous</h3>
              <p className="text-sm text-slate-500 mt-1">Choisissez vos prestations et une date. L’entreprise vous confirmera rapidement.</p>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500">Date et heure souhaitées</label>
              <input
                type="datetime-local"
                data-testid="req-date"
                value={form.requested_date}
                onChange={(e) => setForm({ ...form, requested_date: e.target.value })}
                className="w-full bg-transparent border-b border-slate-200 py-2 focus:border-[#0A192F] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500">Prestations</label>
              <div className="max-h-60 overflow-y-auto mt-2 divide-y divide-slate-100 border border-slate-100 rounded-xl">
                {availableSvc.map((s) => {
                  const selected = form.service_ids.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      data-testid={`req-svc-${s.id}`}
                      onClick={() => setForm({
                        ...form,
                        service_ids: selected ? form.service_ids.filter((x) => x !== s.id) : [...form.service_ids, s.id],
                      })}
                      className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-sm transition ${selected ? "bg-[#0A192F]/5" : "hover:bg-slate-50"}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selected ? "border-[#0A192F] bg-[#0A192F]" : "border-slate-300"}`}>
                          {selected && <Check className="w-2.5 h-2.5 text-white" />}
                        </span>
                        {s.name}
                      </span>
                      <span className="text-xs text-slate-500">{money(s.price)} · {s.duration_minutes}min</span>
                    </button>
                  );
                })}
              </div>
              {totalDuration > 0 && (
                <div className="mt-2 text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Durée prévue : {totalDuration} min</div>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500">Commentaire (facultatif)</label>
              <textarea
                data-testid="req-comment"
                rows={2}
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                className="w-full bg-transparent border-b border-slate-200 py-2 focus:border-[#0A192F] focus:outline-none text-sm"
                placeholder="Une préférence particulière ?"
              />
            </div>
            <button
              onClick={submitRequest}
              disabled={sending}
              data-testid="submit-request-btn"
              className="w-full bg-[#0A192F] text-white rounded-full px-6 py-3.5 font-medium flex items-center justify-center gap-2 hover:bg-[#1E3A8A] disabled:opacity-50"
            >
              <MessageSquare className="w-4 h-4" /> {sending ? "Envoi..." : "Envoyer ma demande"}
            </button>

            {/* Pending requests */}
            {requests.filter((r) => r.status !== "accepted" && r.status !== "rejected").length > 0 && (
              <div className="pt-4 border-t border-slate-100">
                <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Demandes en cours</div>
                <ul className="space-y-2">
                  {requests.filter((r) => r.status === "pending" || r.status === "counter_proposed").map((r) => (
                    <li key={r.id} className="text-sm flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div>
                        <div className="font-medium">{fmtDate(r.status === "counter_proposed" ? r.counter_proposed_date : r.requested_date)}</div>
                        <div className="text-xs text-slate-500">
                          {r.status === "pending" ? "En attente de validation" : "Nouveau créneau à valider"}
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{r.status === "pending" ? "En attente" : "Contre-prop."}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {tab === "messages" && <ClientChat token={token} />}

        <footer className="text-center text-xs text-slate-400 pt-4">
          Espace privé · {brand.name}
        </footer>
      </main>
    </div>
  );
}

function LoadingScreen() {
  return <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">Chargement…</div>;
}

function ErrorScreen({ msg }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="font-serif text-2xl mb-2">Accès impossible</h1>
        <p className="text-slate-500 text-sm">{msg}</p>
      </div>
    </div>
  );
}
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/lib/api";
import { Bell, Calendar, Star, Gift, Scissors, ClipboardList, MessageSquare, Check, X, Sparkles, Clock, Award, Receipt, Download, Users, Share2 } from "lucide-react";
import { toast, Toaster } from "sonner";
import ClientChat from "@/components/app/ClientChat";

const money = (v) => (Math.round((v || 0) * 100) / 100).toFixed(2);
const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
};

const PAYMENT_LABELS = { CB: "Carte bancaire", CHEQUE: "Chèque", ESPECES: "Espèces", VIREMENT: "Virement" };

export default function ClientSpace() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("fidelite"); // "fidelite" | "historique" | "rdv"

  const [form, setForm] = useState({ requested_date: "", service_ids: [], comment: "" });
  const [availableSvc, setAvailableSvc] = useState([]);
  const [sending, setSending] = useState(false);
  const [altOpen, setAltOpen] = useState(false);
  const [altDate, setAltDate] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, svc] = await Promise.all([
        axios.get(`${API}/public/client/${token}`),
        axios.get(`${API}/public/client/${token}/services`),
      ]);
      const fresh = r.data;
      setData((prev) => ({
        ...fresh,
        notifications: (fresh.notifications?.length ? fresh.notifications : prev?.notifications) || [],
      }));
      setAvailableSvc(svc.data);
      // Mark as read: they stay visible this session, gone at next visit
      axios.post(`${API}/public/client/${token}/notifications/read`).catch(() => {});
    } catch (e) {
      setError(e.response?.data?.detail || "Lien invalide");
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const submitRequest = async () => {
    if (!form.requested_date) return toast.error("Choisissez une date et une heure");
    if (form.service_ids.length === 0) return toast.error("Sélectionnez au moins une prestation");
    setSending(true);
    try {
      await axios.post(`${API}/public/client/${token}/appointment-requests`, {
        requested_date: new Date(form.requested_date).toISOString(),
        service_ids: form.service_ids,
        comment: form.comment,
      });
      toast.success("Demande envoyée !");
      setForm({ requested_date: "", service_ids: [], comment: "" });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    } finally {
      setSending(false);
    }
  };

  const respondCounter = async (rid, decision, newDate = null) => {
    try {
      await axios.post(`${API}/public/client/${token}/appointment-requests/${rid}/respond`, {
        decision,
        requested_date: newDate ? new Date(newDate).toISOString() : null,
      });
      toast.success(decision === "accept" ? "Rendez-vous confirmé !" : "Nouvelle date envoyée");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  const dismissNotifs = async () => {
    try {
      await axios.post(`${API}/public/client/${token}/notifications/dismiss`);
      setData((prev) => ({ ...prev, notifications: [] }));
    } catch (e) {
      console.warn("dismiss notifications:", e);
    }
  };

  const totalDuration = useMemo(() => {
    return form.service_ids.reduce((acc, id) => {
      const s = availableSvc.find((x) => x.id === id);
      return acc + (s?.duration_minutes || 0);
    }, 0);
  }, [form.service_ids, availableSvc]);

  const shareReferral = async () => {
    const firstName = data?.client?.first_name || "";
    const brandName = data?.brand?.name || "Mon entreprise";
    const msg = `Salut, je te recommande ${brandName}, coiffeur à domicile ! Prestation vraiment top. Contacte-le au 07 44 42 64 62 pour prendre RDV. Dis-lui que ${firstName} t'envoie 😉`;
    // Try native share first (best on mobile PWA)
    if (navigator.share) {
      try {
        await navigator.share({ title: brandName, text: msg });
        return;
      } catch {
        // user cancelled or share failed — fall back to sms:
      }
    }
    // Fallback: sms: URL scheme (opens native SMS composer)
    const encoded = encodeURIComponent(msg);
    // iOS uses "sms:&body=", Android uses "sms:?body="
    const ua = navigator.userAgent || "";
    const url = /iPhone|iPad|iPod/i.test(ua) ? `sms:&body=${encoded}` : `sms:?body=${encoded}`;
    window.location.href = url;
  };

  if (error) return <ErrorScreen msg={error} />;
  if (!data) return <LoadingScreen />;

  const { client, appointments, requests, loyalty, notifications, brand, invoices, referral } = data;
  const isFemale = ["femme", "female", "féminin", "feminin", "f"].includes(
    String(client.gender || "").trim().toLowerCase()
  );
  const reviewLink = brand.review_url_short || brand.review_url || `https://www.google.com/search?q=${encodeURIComponent((brand.name || "Mon entreprise") + " coiffure avis")}`;
  const activeCounter = requests.find((r) => r.status === "counter_proposed");
  const doneAppointments = appointments.filter((a) => a.status === "done");
  const upcomingAppointments = appointments
    .filter((a) => a.status === "scheduled" && new Date(a.date) >= new Date(Date.now() - 3600 * 1000))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <Toaster position="top-center" richColors closeButton />
      {/* Header hero */}
      <header className="bg-[#0A192F] text-white px-5 pt-8 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{
          background: "radial-gradient(circle at 30% 20%, #D4AF37 0%, transparent 40%)",
        }} />
        <div className="relative max-w-2xl mx-auto">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-white/50 mb-3">
            <Scissors className="w-3.5 h-3.5 text-[#D4AF37]" /> {brand.name}
          </div>
          <h1 className="font-serif text-4xl leading-tight" data-testid="client-space-title">
            Bonjour {client.first_name || client.last_name} 👋
          </h1>
          <p className="text-white/70 text-sm mt-2">Votre espace personnel — fidélité, historique et demandes de rendez-vous.</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 -mt-10 relative pb-16 space-y-6">
        {/* Notifications */}
        {notifications && notifications.length > 0 && (
          <section className="bg-white border border-[#D4AF37]/30 rounded-3xl p-5 shadow-lg" data-testid="client-notifications">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#D4AF37]" />
                <h2 className="text-sm font-semibold tracking-wide">Notifications</h2>
              </div>
              <button
                onClick={dismissNotifs}
                data-testid="dismiss-notifications-btn"
                aria-label="Fermer les notifications"
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="space-y-2">
              {notifications.slice(0, 5).map((n, i) => (
                <li key={n.id || i} className="text-sm text-slate-700 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] mt-2 flex-shrink-0" />
                  <div>
                    <div>{n.message}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{fmtDate(n.created_at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Counter-proposal alert */}
        {activeCounter && (
          <section className="bg-gradient-to-br from-[#D4AF37]/10 to-white border border-[#D4AF37]/50 rounded-3xl p-5 shadow-premium" data-testid="counter-proposal-card">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#8A6A1F] mb-2">Nouveau créneau proposé</div>
            <div className="font-serif text-2xl mb-1">{fmtDate(activeCounter.counter_proposed_date)}</div>
            {activeCounter.admin_note && <div className="text-sm text-slate-600 italic">« {activeCounter.admin_note} »</div>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => respondCounter(activeCounter.id, "accept")} data-testid="accept-counter-btn" className="flex-1 bg-[#0A192F] text-white rounded-full px-4 py-2.5 text-sm flex items-center justify-center gap-2 hover:bg-[#1E3A8A]"><Check className="w-4 h-4" /> Accepter</button>
              <button onClick={() => setAltOpen((v) => !v)} data-testid="reject-counter-btn" className="flex-1 border border-slate-200 rounded-full px-4 py-2.5 text-sm flex items-center justify-center gap-2 text-slate-600 hover:bg-slate-50"><X className="w-4 h-4" /> Autre date</button>
            </div>
            {altOpen && (
              <div className="mt-3 bg-white border border-slate-100 rounded-xl p-4 space-y-3" data-testid="alt-date-form">
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500">Quelle date vous conviendrait ?</label>
                  <input
                    type="datetime-local"
                    data-testid="alt-date-input"
                    value={altDate}
                    onChange={(e) => setAltDate(e.target.value)}
                    className="w-full bg-transparent border-b border-slate-200 py-2 focus:border-[#0A192F] focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => {
                    if (!altDate) return toast.error("Choisissez une date");
                    respondCounter(activeCounter.id, "reject", altDate);
                    setAltOpen(false);
                    setAltDate("");
                  }}
                  data-testid="alt-date-send-btn"
                  className="w-full bg-[#0A192F] text-white rounded-full px-4 py-2.5 text-sm"
                >
                  Envoyer ma proposition
                </button>
              </div>
            )}
          </section>
        )}

        {/* Upcoming appointments */}
        {upcomingAppointments.length > 0 && (
          <section className="bg-white border border-blue-100 rounded-3xl p-5 shadow-premium" data-testid="upcoming-appointments">
            <div className="text-[10px] tracking-[0.3em] uppercase text-[#1E3A8A] mb-3 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> Vos prochains rendez-vous
            </div>
            <ul className="space-y-3">
              {upcomingAppointments.map((a) => (
                <li key={a.id} data-testid={`upcoming-rdv-${a.id}`} className="flex items-start justify-between gap-3 bg-gradient-to-r from-blue-50/60 to-white border border-blue-100/60 rounded-2xl p-4">
                  <div>
                    <div className="font-serif text-lg text-[#0A192F] capitalize">{fmtDate(a.date)}</div>
                    {a.services?.length > 0 && (
                      <div className="text-xs text-slate-500 mt-1">{a.services.map((s) => s.name).join(" · ")}</div>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-[10px] px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium flex items-center gap-1">
                    <Check className="w-3 h-3" /> Confirmé
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Tabs */}
        <div className="grid grid-cols-5 gap-1 bg-white rounded-2xl p-1.5 shadow-sm">
          {[
            { id: "fidelite", label: "Fidélité", icon: Star },
            { id: "historique", label: "Historique", icon: ClipboardList },
            { id: "factures", label: "Factures", icon: Receipt },
            { id: "rdv", label: "RDV", icon: Sparkles },
            { id: "messages", label: "Messages", icon: MessageSquare },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              data-testid={`tab-${t.id}`}
              className={`min-w-0 flex flex-col items-center justify-center gap-1 px-1 py-2.5 rounded-xl text-[11px] sm:text-xs font-medium transition ${
                tab === t.id ? "bg-[#0A192F] text-white" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              <t.icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate w-full text-center">{t.label}</span>
            </button>
          ))}
        </div>

        {tab === "fidelite" && (
          <section className="space-y-4">
            {/* Loyalty summary card */}
            <div className={`bg-gradient-to-br ${isFemale ? "from-[#EC4899] via-[#DB2777] to-[#BE185D]" : "from-[#0A192F] to-[#1E3A8A]"} text-white rounded-3xl p-6 shadow-premium`} data-testid="loyalty-summary">
              <div className="text-[10px] tracking-[0.3em] uppercase text-white/60 mb-2">Carte de fidélité</div>
              <div className="flex items-baseline gap-6">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/60">Prestations payées</div>
                  <div className="font-serif text-4xl mt-1">{loyalty.total_visits}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-white/60">Récompenses</div>
                  <div className="font-serif text-4xl text-[#D4AF37] mt-1">{loyalty.total_rewards}</div>
                </div>
              </div>
              <div className="text-xs text-white/70 mt-4 flex items-center gap-1.5"><Gift className="w-3.5 h-3.5 text-[#D4AF37]" /> 5 payées = 1 offerte, par prestation</div>
            </div>

            {/* Loyalty details per service */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
              <h3 className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-3">Prestations engagées</h3>
              {loyalty.rows.filter((r) => r.count > 0).length === 0 ? (
                <div className="text-sm text-slate-500 py-4 text-center">Pas encore de visite enregistrée. À bientôt !</div>
              ) : (
                <ul className="space-y-3">
                  {loyalty.rows.filter((r) => r.count > 0).map((r) => (
                    <li key={r.service_id} data-testid={`loyalty-row-${r.service_id}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-sm font-medium">{r.name}</div>
                        <div className="text-xs text-slate-500">
                          {r.remaining === 0 ? (
                            <span className="text-[#D4AF37] font-semibold flex items-center gap-1"><Award className="w-3 h-3" /> Récompense disponible</span>
                          ) : (
                            `${r.remaining} avant récompense`
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {Array.from({ length: loyalty.target_per_reward }).map((_, i) => (
                          <div
                            key={i}
                            className={`flex-1 h-2 rounded-full ${i < r.current ? "bg-[#D4AF37]" : "bg-slate-200"}`}
                          />
                        ))}
                      </div>
                      {r.cycles > 0 && <div className="text-[10px] text-slate-500 mt-1">{r.cycles} récompense{r.cycles > 1 ? "s" : ""} accumulée{r.cycles > 1 ? "s" : ""}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Referral (parrainage) */}
            {referral?.referred_by && (
              <div className="bg-white border border-[#D4AF37]/30 rounded-3xl p-5 shadow-sm" data-testid="referral-child-card">
                <div className="text-[10px] tracking-[0.3em] uppercase text-[#8A6A1F] mb-2 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Filleul
                </div>
                <div className="text-sm text-slate-600">
                  Vous avez été recommandé(e) par <span className="font-semibold text-[#0A192F]">{referral.referred_by_name || "votre parrain"}</span>.
                </div>
              </div>
            )}
            {referral && !referral.referred_by && (
              <div className="bg-white border border-[#D4AF37]/30 rounded-3xl p-5 shadow-sm space-y-4" data-testid="referral-card">
                <div className="text-[10px] tracking-[0.3em] uppercase text-[#8A6A1F] flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Parrainage
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 rounded-2xl p-3">
                    <div className="font-serif text-2xl text-[#0A192F]" data-testid="referral-godchildren">{referral.godchildren_count}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">Filleul{referral.godchildren_count > 1 ? "s" : ""}</div>
                  </div>
                  <div className="bg-[#D4AF37]/10 rounded-2xl p-3">
                    <div className="font-serif text-2xl text-[#C5A059]" data-testid="referral-rewards-available">{referral.rewards_available}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">Offerte{referral.rewards_available > 1 ? "s" : ""} dispo</div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-3">
                    <div className="font-serif text-2xl text-slate-500">{referral.rewards_used}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">Utilisée{referral.rewards_used > 1 ? "s" : ""}</div>
                  </div>
                </div>
                {referral.rewards_available > 0 ? (
                  <div className="text-sm text-[#8A6A1F] bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl px-4 py-3 flex items-center gap-2">
                    <Gift className="w-4 h-4 flex-shrink-0" /> Une coupe offerte vous attend lors de votre prochain rendez-vous !
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">
                    Plus que <span className="font-semibold text-[#0A192F]">{referral.remaining_to_next}</span> recommandation{referral.remaining_to_next > 1 ? "s" : ""} avant votre prochaine coupe offerte.
                  </div>
                )}
                {referral.godchildren?.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1.5">Vos filleuls</div>
                    <div className="flex flex-wrap gap-1.5">
                      {referral.godchildren.map((g) => (
                        <span key={g.id} className="text-xs px-2.5 py-1 rounded-full bg-slate-50 border border-slate-100 text-slate-600">{g.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={shareReferral}
                  data-testid="referral-share-btn"
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#D4AF37] to-[#C5A059] text-white rounded-full px-5 py-3 text-sm font-medium shadow-premium hover:shadow-lg transition"
                >
                  <Share2 className="w-4 h-4" /> Recommander à un ami
                </button>
                <p className="text-xs text-slate-500 italic border-t border-slate-100 pt-3">
                  « Recommandez mon service à votre entourage. Toutes les {referral.threshold} recommandations devenues clientes, profitez d'une coupe offerte en remerciement de votre confiance. »
                </p>
              </div>
            )}

            {/* Google Review CTA */}
            {reviewLink && (
              <a
                href={reviewLink}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="review-btn"
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#D4AF37] to-[#C5A059] text-white rounded-full px-5 py-3.5 font-medium shadow-premium hover:shadow-lg transition"
              >
                <Star className="w-4 h-4 fill-current" /> Laisser un avis sur Google
              </a>
            )}
          </section>
        )}

        {tab === "historique" && (
          <section className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100" data-testid="history-section">
            <h3 className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-3">Historique des rendez-vous</h3>
            {doneAppointments.length === 0 ? (
              <div className="text-sm text-slate-500 py-4 text-center">Aucun rendez-vous terminé pour le moment.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {doneAppointments.map((a) => (
                  <li key={a.id} className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{fmtDate(a.date)}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{a.services.map((s) => s.name).join(" · ")}</div>
                      </div>
                      <div className="text-sm font-semibold text-[#0A192F]">{money(a.price_final)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "factures" && (
          <section className="space-y-4" data-testid="invoices-section">
            {(!invoices || invoices.length === 0) ? (
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 text-sm text-slate-500 text-center">Aucune facture pour le moment.</div>
            ) : (
              invoices.map((inv) => (
                <div key={inv.id} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100" data-testid={`invoice-${inv.id}`}>
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <div className="text-[10px] tracking-[0.25em] uppercase text-[#8A6A1F] flex items-center gap-1.5">
                        <Receipt className="w-3 h-3" /> {inv.invoice_number || "Facture"}
                      </div>
                      <div className="font-medium text-sm mt-1">{fmtDate(inv.date)}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-serif text-2xl text-[#0A192F]">{money(inv.price_final)}</div>
                      {inv.payment_mode && <div className="text-[10px] text-slate-400">{PAYMENT_LABELS[inv.payment_mode] || inv.payment_mode}</div>}
                    </div>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {inv.services.map((s, i) => (
                      <li key={i} className="flex items-center justify-between text-sm">
                        <div>
                          <span>{s.name}</span>
                          <span className="text-xs text-slate-400 ml-2">par {s.stylist}</span>
                        </div>
                        {s.is_gift ? (
                          <span className="text-xs text-[#C5A059] font-medium flex items-center gap-1"><Gift className="w-3 h-3" /> Offerte</span>
                        ) : (
                          <span className="text-slate-600">{money(s.price)}</span>
                        )}
                      </li>
                    ))}
                    {inv.fuel_supplement > 0 && (
                      <li className="flex items-center justify-between text-sm text-slate-500">
                        <span>Supplément déplacement</span>
                        <span>{money(inv.fuel_supplement)}</span>
                      </li>
                    )}
                  </ul>
                  <a
                    href={`${API}/public/client/${token}/invoices/${inv.id}/pdf`}
                    download
                    data-testid={`invoice-pdf-${inv.id}`}
                    className="mt-4 w-full flex items-center justify-center gap-2 border border-[#D4AF37]/50 text-[#8A6A1F] rounded-full px-4 py-2.5 text-sm font-medium hover:bg-[#D4AF37]/10 transition"
                  >
                    <Download className="w-4 h-4" /> Télécharger en PDF
                  </a>
                </div>
              ))
            )}
          </section>
        )}

        {tab === "rdv" && (
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4" data-testid="request-form">
            <div>
              <h3 className="font-serif text-2xl">Demander un rendez-vous</h3>
              <p className="text-sm text-slate-500 mt-1">Choisissez vos prestations et une date. L’entreprise vous confirmera rapidement.</p>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500">Date et heure souhaitées</label>
              <input
                type="datetime-local"
                data-testid="req-date"
                value={form.requested_date}
                onChange={(e) => setForm({ ...form, requested_date: e.target.value })}
                className="w-full bg-transparent border-b border-slate-200 py-2 focus:border-[#0A192F] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500">Prestations</label>
              <div className="max-h-60 overflow-y-auto mt-2 divide-y divide-slate-100 border border-slate-100 rounded-xl">
                {availableSvc.map((s) => {
                  const selected = form.service_ids.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      data-testid={`req-svc-${s.id}`}
                      onClick={() => setForm({
                        ...form,
                        service_ids: selected ? form.service_ids.filter((x) => x !== s.id) : [...form.service_ids, s.id],
                      })}
                      className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-sm transition ${selected ? "bg-[#0A192F]/5" : "hover:bg-slate-50"}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selected ? "border-[#0A192F] bg-[#0A192F]" : "border-slate-300"}`}>
                          {selected && <Check className="w-2.5 h-2.5 text-white" />}
                        </span>
                        {s.name}
                      </span>
                      <span className="text-xs text-slate-500">{money(s.price)} · {s.duration_minutes}min</span>
                    </button>
                  );
                })}
              </div>
              {totalDuration > 0 && (
                <div className="mt-2 text-xs text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Durée prévue : {totalDuration} min</div>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500">Commentaire (facultatif)</label>
              <textarea
                data-testid="req-comment"
                rows={2}
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                className="w-full bg-transparent border-b border-slate-200 py-2 focus:border-[#0A192F] focus:outline-none text-sm"
                placeholder="Une préférence particulière ?"
              />
            </div>
            <button
              onClick={submitRequest}
              disabled={sending}
              data-testid="submit-request-btn"
              className="w-full bg-[#0A192F] text-white rounded-full px-6 py-3.5 font-medium flex items-center justify-center gap-2 hover:bg-[#1E3A8A] disabled:opacity-50"
            >
              <MessageSquare className="w-4 h-4" /> {sending ? "Envoi..." : "Envoyer ma demande"}
            </button>

            {/* Pending requests */}
            {requests.filter((r) => r.status !== "accepted" && r.status !== "rejected").length > 0 && (
              <div className="pt-4 border-t border-slate-100">
                <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Demandes en cours</div>
                <ul className="space-y-2">
                  {requests.filter((r) => r.status === "pending" || r.status === "counter_proposed").map((r) => (
                    <li key={r.id} className="text-sm flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div>
                        <div className="font-medium">{fmtDate(r.status === "counter_proposed" ? r.counter_proposed_date : r.requested_date)}</div>
                        <div className="text-xs text-slate-500">
                          {r.status === "pending" ? "En attente de validation" : "Nouveau créneau à valider"}
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{r.status === "pending" ? "En attente" : "Contre-prop."}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {tab === "messages" && <ClientChat token={token} />}

        <footer className="text-center text-xs text-slate-400 pt-4">
          Espace privé · {brand.name}
        </footer>
      </main>
    </div>
  );
}

function LoadingScreen() {
  return <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">Chargement…</div>;
}

function ErrorScreen({ msg }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="font-serif text-2xl mb-2">Accès impossible</h1>
        <p className="text-slate-500 text-sm">{msg}</p>
      </div>
    </div>
  );
}
