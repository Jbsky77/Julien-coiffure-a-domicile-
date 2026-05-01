import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money2, genderLabel } from "@/lib/api";
import { AlertCircle, Phone, Plus, MessageSquare } from "lucide-react";

const STATUS_META = {
  actif: { label: "Actif", color: "bg-green-50 text-green-700 border-green-200" },
  a_relancer: { label: "À relancer", color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  en_retard: { label: "En retard", color: "bg-orange-50 text-orange-700 border-orange-200" },
  presque_perdu: { label: "Presque perdu", color: "bg-red-50 text-red-700 border-red-200" },
  perdu: { label: "Perdu", color: "bg-slate-200 text-slate-700 border-slate-300" },
};

export default function ClientStatus() {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState("at_risk");

  useEffect(() => {
    (async () => {
      const r = await api.get("/clients/status");
      setList(r.data);
    })();
  }, []);

  const filtered = list.filter((c) => {
    if (filter === "all") return true;
    if (filter === "at_risk") return ["a_relancer", "en_retard", "presque_perdu", "perdu"].includes(c.status);
    return c.status === filter;
  });

  const sendSMS = (c) => {
    const msg = `Bonjour ${c.first_name}, c'est Julien votre coiffeur. Cela fait quelque temps que je ne vous ai pas vu(e), souhaitez-vous reprendre rendez-vous ?`;
    const phone = c.phone?.replace(/\s/g, "") || "";
    if (!phone) return;
    api.post(`/clients/${c.id}/relance`).catch(() => {});
    window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="space-y-6" data-testid="client-status-page">
      <div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Relance commerciale</div>
        <h1 className="font-serif text-3xl tracking-tight">Clients à risque</h1>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { id: "at_risk", l: "À relancer" },
          { id: "actif", l: "Actifs" },
          { id: "presque_perdu", l: "Presque perdus" },
          { id: "perdu", l: "Perdus" },
          { id: "all", l: "Tous" },
        ].map((t) => (
          <button key={t.id} onClick={() => setFilter(t.id)} data-testid={`filter-${t.id}`} className={`px-4 py-2 rounded-full text-sm ${filter === t.id ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>{t.l}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-slate-400 text-sm py-10 text-center">Aucun client dans cette catégorie.</div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => {
            const meta = STATUS_META[c.status] || STATUS_META.actif;
            return (
              <li key={c.id} className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3" data-testid={`status-row-${c.id}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <Link to={`/clients/${c.id}`} className="font-medium hover:underline">
                      {genderLabel(c.gender) && <span className="text-slate-500 text-xs mr-1">{genderLabel(c.gender)}</span>}
                      {c.first_name} {c.last_name}
                    </Link>
                    <div className="text-xs text-slate-500 mt-1">
                      {c.n_rdv} RDV · panier {money2(c.avg_basket)} € · fréq. ~{c.avg_frequency_days}j
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Dernier RDV il y a <strong>{c.days_since}j</strong>
                    </div>
                  </div>
                  <span className={`text-[9px] tracking-wider uppercase px-2 py-1 rounded-full border whitespace-nowrap ${meta.color}`}>{meta.label}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.phone && <button onClick={() => sendSMS(c)} data-testid={`relance-sms-${c.id}`} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-[#0A192F] text-white"><MessageSquare className="w-3 h-3" /> Relancer SMS</button>}
                  <Link to={`/rdv/nouveau?client=${c.id}`} data-testid={`new-rdv-${c.id}`} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-gold-gradient text-white"><Plus className="w-3 h-3" /> Nouveau RDV</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
