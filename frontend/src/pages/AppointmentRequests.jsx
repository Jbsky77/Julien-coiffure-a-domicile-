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
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                    <button onClick={() => act(r.id, "accept")} data-testid={`accept-${r.id}`} className="flex-1 bg-[#0A192F] text-white rounded-full px-4 py-2 text-xs flex items-center justify-center gap-1.5 hover:bg-[#1E3A8A]"><Check className="w-3.5 h-3.5" /> Accepter</button>
                    <button
                      onClick={() => {
                        const d = window.prompt("Nouveau créneau (YYYY-MM-DDTHH:MM)", (shownDate || "").slice(0, 16));
                        if (!d) return;
                        const note = window.prompt("Message pour le client (facultatif)", "") || "";
                        act(r.id, "counter", new Date(d).toISOString(), note);
                      }}
                      data-testid={`counter-${r.id}`}
                      className="flex-1 border border-blue-200 text-blue-700 rounded-full px-4 py-2 text-xs flex items-center justify-center gap-1.5 hover:bg-blue-50"
                    >
                      <Clock className="w-3.5 h-3.5" /> Proposer autre
                    </button>
                    <button
                      onClick={() => {
                        if (!window.confirm("Refuser cette demande ?")) return;
                        act(r.id, "reject");
                      }}
                      data-testid={`reject-${r.id}`}
                      className="flex-1 border border-red-200 text-red-700 rounded-full px-4 py-2 text-xs flex items-center justify-center gap-1.5 hover:bg-red-50"
                    >
                      <X className="w-3.5 h-3.5" /> Refuser
                    </button>
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
