import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Bell, Check, X, Clock, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const money = (v) => (Math.round((v || 0) * 100) / 100).toFixed(2);
const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};

const STATUS_LABELS = {
  pending: { label: "En attente", color: "bg-amber-100 text-amber-700" },
  counter_proposed: { label: "Contre-prop.", color: "bg-blue-100 text-blue-700" },
  accepted: { label: "Accepté", color: "bg-green-100 text-green-700" },
  rejected: { label: "Refusé", color: "bg-red-100 text-red-700" },
  cancelled: { label: "Annulé", color: "bg-slate-100 text-slate-700" },
};

export default function AppointmentRequests() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState("open"); // "open" | "all" | status name
  const [counterFor, setCounterFor] = useState(null);
  const [counterDate, setCounterDate] = useState("");
  const [counterNote, setCounterNote] = useState("");
  const [rejectFor, setRejectFor] = useState(null);

  const load = async () => {
    const [r, _] = await Promise.all([
      api.get("/appointment-requests"),
      api.post("/notifications/admin/mark-read").catch(() => {}),
    ]);
    setRequests(r.data || []);
  };

  useEffect(() => { load(); }, []);

  const filtered = requests.filter((r) => {
    if (filter === "all") return true;
    if (filter === "open") return r.status === "pending" || r.status === "counter_proposed";
    return r.status === filter;
  });

  const act = async (rid, action, counter_date = null, note = "") => {
    try {
      await api.post(`/appointment-requests/${rid}/action`, { action, counter_date, admin_note: note });
      toast.success(
        action === "accept" ? "Rendez-vous créé et confirmé !"
        : action === "reject" ? "Demande refusée"
        : "Contre-proposition envoyée"
      );
      setCounterFor(null);
      setRejectFor(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erreur");
    }
  };

  return (
    <div className="space-y-6" data-testid="requests-page">
      <div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Espace client</div>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight">Demandes de RDV</h1>
        <p className="mt-2 text-sm text-slate-500">Validez, refusez ou proposez un autre créneau.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: "open", l: "En cours" },
          { id: "all", l: "Toutes" },
          { id: "accepted", l: "Acceptées" },
          { id: "rejected", l: "Refusées" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            data-testid={`filter-${t.id}`}
            className={`px-4 py-1.5 rounded-full text-xs uppercase tracking-wider ${filter === t.id ? "bg-[#0A192F] text-white" : "bg-white border border-slate-200 text-slate-600"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-sm text-slate-500 border border-slate-100">
          Aucune demande pour ce filtre.
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => {
            const status = STATUS_LABELS[r.status] || STATUS_LABELS.pending;
            const shownDate = r.status === "counter_proposed" ? r.counter_proposed_date : r.requested_date;
            const editable = r.status === "pending" || r.status === "counter_proposed";
            return (
              <li key={r.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm" data-testid={`request-${r.id}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <Link to={`/clients/${r.client_id}`} className="font-medium text-[#0A192F] hover:underline">{r.client_name}</Link>
                    <div className="text-sm text-slate-600 mt-1 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {fmtDate(shownDate)}</div>
                    <div className="text-xs text-slate-500 mt-1">{r.services.map((s) => s.name).join(" · ")}</div>
                    {r.comment && <div className="text-xs italic text-slate-500 mt-2 flex items-start gap-1"><MessageSquare className="w-3 h-3 mt-0.5" /> « {r.comment} »</div>}
                    <div className="text-[10px] text-slate-400 mt-1">Reçu {fmtDate(r.created_at)}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${status.color}`}>{status.label}</span>
                </div>
                {editable && (
                  <div className="pt-2 border-t border-slate-100 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => act(r.id, "accept")} data-testid={`accept-${r.id}`} className="flex-1 bg-[#0A192F] text-white rounded-full px-4 py-2 text-xs flex items-center justify-center gap-1.5 hover:bg-[#1E3A8A]"><Check className="w-3.5 h-3.5" /> Accepter</button>
                      <button
                        onClick={() => {
                          setRejectFor(null);
                          setCounterFor(counterFor === r.id ? null : r.id);
                          setCounterDate((shownDate || "").slice(0, 16));
                          setCounterNote("");
                        }}
                        data-testid={`counter-${r.id}`}
                        className="flex-1 border border-blue-200 text-blue-700 rounded-full px-4 py-2 text-xs flex items-center justify-center gap-1.5 hover:bg-blue-50"
                      >
                        <Clock className="w-3.5 h-3.5" /> Proposer autre
                      </button>
                      <button
                        onClick={() => { setCounterFor(null); setRejectFor(rejectFor === r.id ? null : r.id); }}
                        data-testid={`reject-${r.id}`}
                        className="flex-1 border border-red-200 text-red-700 rounded-full px-4 py-2 text-xs flex items-center justify-center gap-1.5 hover:bg-red-50"
                      >
                        <X className="w-3.5 h-3.5" /> Refuser
                      </button>
                    </div>

                    {counterFor === r.id && (
                      <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 space-y-3" data-testid={`counter-form-${r.id}`}>
                        <div>
                          <label className="text-[10px] tracking-widest uppercase text-slate-500">Nouveau créneau proposé</label>
                          <input
                            type="datetime-local"
                            data-testid="counter-date-input"
                            value={counterDate}
                            onChange={(e) => setCounterDate(e.target.value)}
                            className="w-full bg-transparent border-b border-slate-300 py-2 focus:border-[#0A192F] focus:outline-none text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] tracking-widest uppercase text-slate-500">Message pour le client (facultatif)</label>
                          <input
                            data-testid="counter-note-input"
                            value={counterNote}
                            onChange={(e) => setCounterNote(e.target.value)}
                            placeholder="Ex : Je suis déjà pris à cette heure-là"
                            className="w-full bg-transparent border-b border-slate-300 py-2 focus:border-[#0A192F] focus:outline-none text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (!counterDate) return toast.error("Choisissez un créneau");
                              act(r.id, "counter", new Date(counterDate).toISOString(), counterNote);
                            }}
                            data-testid="counter-send-btn"
                            className="flex-1 bg-blue-600 text-white rounded-full px-4 py-2 text-xs flex items-center justify-center gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5" /> Envoyer la proposition
                          </button>
                          <button onClick={() => setCounterFor(null)} data-testid="counter-cancel-btn" className="px-4 py-2 rounded-full border border-slate-200 text-xs text-slate-600">Annuler</button>
                        </div>
                      </div>
                    )}

                    {rejectFor === r.id && (
                      <div className="bg-red-50/60 border border-red-100 rounded-xl p-4 space-y-3" data-testid={`reject-confirm-${r.id}`}>
                        <div className="text-sm text-red-800">Refuser cette demande ? Le client sera notifié.</div>
                        <div className="flex gap-2">
                          <button onClick={() => act(r.id, "reject")} data-testid="reject-confirm-btn" className="flex-1 bg-red-600 text-white rounded-full px-4 py-2 text-xs flex items-center justify-center gap-1.5"><X className="w-3.5 h-3.5" /> Oui, refuser</button>
                          <button onClick={() => setRejectFor(null)} data-testid="reject-cancel-btn" className="px-4 py-2 rounded-full border border-slate-200 text-xs text-slate-600">Annuler</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
