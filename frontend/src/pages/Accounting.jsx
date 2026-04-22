import React, { useEffect, useState } from "react";
import { api, money, money2, fmtMonth } from "@/lib/api";
import { toast } from "sonner";
import { ExternalLink, RefreshCcw, ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function currentYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(yyyymm, delta) {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Accounting() {
  const [yyyymm, setYYYYMM] = useState(currentYYYYMM());
  const [data, setData] = useState(null);
  const [months, setMonths] = useState([]);
  const [tab, setTab] = useState("summary");

  const load = async () => {
    const [r, m] = await Promise.all([api.get(`/accounting/month/${yyyymm}`), api.get("/accounting/months")]);
    setData(r.data);
    setMonths(m.data);
  };
  useEffect(() => { load(); }, [yyyymm]);

  const setStatus = async (monthKey, patch) => {
    await api.post(`/accounting/urssaf/${monthKey}`, patch);
    toast.success("Statut mis à jour");
    load();
  };

  const resetMonth = async (monthKey) => {
    if (!window.confirm(`Supprimer tous les RDV de ${fmtMonth(monthKey)} et remettre le mois à 0 ?`)) return;
    const r = await api.post(`/accounting/reset/${monthKey}`);
    toast.success(`Mois remis à 0 (${r.data.deleted} RDV supprimés)`);
    load();
  };

  const exportCSV = () => {
    const rows = [
      ["Mois", fmtMonth(yyyymm)],
      ["CA brut (€)", money2(data.ca_brut)],
      ["RDV", data.n_rdv],
      ["URSSAF 22% (arrondi sup.) €", data.urssaf_ceil],
      ["Consommables €", money2(data.consumables)],
      ["Frais fixes €", money2(data.fixed_costs)],
      ["KM total", money2(data.total_km)],
      ["Carburant facturé €", money2(data.fuel_charged)],
      ["Carburant coût réel €", money2(data.fuel_real_cost)],
      ["Carburant balance €", money2(data.fuel_balance)],
      ["Marge nette €", money2(data.marge_nette)],
      [""],
      ["Règlements par mode", "Nombre", "Montant €"],
      ...Object.entries(data.payment_breakdown || {}).map(([k, v]) => [k, v.count, money2(v.amount)]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compta-${yyyymm}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(22);
    doc.setTextColor("#0A192F");
    doc.text("Coiffure à domicile Julien Bouche", 14, 20);
    doc.setFontSize(11);
    doc.setTextColor("#64748B");
    doc.text(`Comptabilité · ${fmtMonth(yyyymm)}`, 14, 28);
    autoTable(doc, {
      startY: 36,
      head: [["Indicateur", "Valeur"]],
      body: [
        ["CA brut", `${money2(data.ca_brut)} €`],
        ["Nombre de RDV", String(data.n_rdv)],
        ["URSSAF 22% (↑)", `${data.urssaf_ceil} €`],
        ["Consommables", `${money2(data.consumables)} €`],
        ["Frais fixes", `${money2(data.fixed_costs)} €`],
        ["KM parcourus", `${money2(data.total_km)} km`],
        ["Carburant facturé", `${money2(data.fuel_charged)} €`],
        ["Carburant coût réel", `${money2(data.fuel_real_cost)} €`],
        ["Balance carburant", `${money2(data.fuel_balance)} €`],
        ["Marge nette", `${money2(data.marge_nette)} €`],
      ],
      theme: "grid",
      headStyles: { fillColor: [10, 25, 47], textColor: 255 },
      styles: { font: "helvetica", fontSize: 10 },
    });
    const payments = Object.entries(data.payment_breakdown || {});
    if (payments.length) {
      autoTable(doc, {
        head: [["Mode de règlement", "Nombre", "Montant"]],
        body: payments.map(([k, v]) => [k, String(v.count), `${money2(v.amount)} €`]),
        theme: "grid",
        headStyles: { fillColor: [212, 175, 55], textColor: 255 },
        styles: { font: "helvetica", fontSize: 10 },
      });
    }
    doc.save(`compta-${yyyymm}.pdf`);
  };

  if (!data) return <div className="text-slate-500">Chargement…</div>;

  return (
    <div className="space-y-8" data-testid="compta-page">
      <div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Comptabilité</div>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight">Chiffres & déclarations</h1>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[{ id: "summary", l: "Mois en cours" }, { id: "urssaf", l: "URSSAF" }, { id: "all", l: "Historique des mois" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`} className={`px-4 py-2 rounded-full text-sm ${tab === t.id ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>{t.l}</button>
        ))}
      </div>

      {tab === "summary" && (
        <>
          <div className="flex items-center justify-between bg-white border border-slate-100 rounded-2xl px-4 py-3">
            <button onClick={() => setYYYYMM(shiftMonth(yyyymm, -1))} data-testid="month-prev" className="p-2 rounded-full hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
            <div className="font-serif text-xl capitalize">{fmtMonth(yyyymm)}</div>
            <button onClick={() => setYYYYMM(shiftMonth(yyyymm, 1))} data-testid="month-next" className="p-2 rounded-full hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-100 rounded-2xl p-5"><div className="text-[10px] tracking-widest uppercase text-slate-500">CA Brut</div><div className="font-serif text-3xl mt-1">{money2(data.ca_brut)} €</div></div>
            <div className="bg-white border border-slate-100 rounded-2xl p-5"><div className="text-[10px] tracking-widest uppercase text-slate-500">URSSAF (22%, ↑)</div><div className="font-serif text-3xl mt-1">{data.urssaf_ceil} €</div></div>
            <div className="bg-white border border-slate-100 rounded-2xl p-5"><div className="text-[10px] tracking-widest uppercase text-slate-500">Charges fixes</div><div className="font-serif text-3xl mt-1">{money2(data.fixed_costs)} €</div></div>
            <div className="bg-white border border-slate-100 rounded-2xl p-5"><div className="text-[10px] tracking-widest uppercase text-slate-500">Marge nette</div><div className={`font-serif text-3xl mt-1 ${data.marge_nette >= 0 ? "" : "text-[#991B1B]"}`}>{money2(data.marge_nette)} €</div></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-100 rounded-2xl p-6">
              <div className="text-[10px] tracking-widest uppercase text-slate-500 mb-4">Règlements · {data.n_rdv} RDV</div>
              {Object.keys(data.payment_breakdown || {}).length === 0 ? <div className="text-slate-400 text-sm">—</div> :
                <ul className="space-y-2">
                  {Object.entries(data.payment_breakdown).map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between text-sm">
                      <span>{k}</span>
                      <span className="text-slate-500">{v.count} · <span className="text-[#0A192F] font-medium">{money2(v.amount)} €</span></span>
                    </li>
                  ))}
                </ul>
              }
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-6">
              <div className="text-[10px] tracking-widest uppercase text-slate-500 mb-4">Carburant & KM</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Kilomètres parcourus</span><span className="font-medium">{money2(data.total_km)} km</span></div>
                <div className="flex justify-between"><span>Facturé clients</span><span className="font-medium">{money2(data.fuel_charged)} €</span></div>
                <div className="flex justify-between"><span>Coût réel</span><span className="font-medium">{money2(data.fuel_real_cost)} €</span></div>
                <div className="flex justify-between pt-2 border-t border-slate-100"><span>Balance</span><span className={data.fuel_balance >= 0 ? "text-[#166534] font-medium" : "text-[#991B1B] font-medium"}>{data.fuel_balance >= 0 ? "+" : ""}{money2(data.fuel_balance)} €</span></div>
                <div className="flex justify-between pt-2"><span>Consommables (2€ × {data.n_rdv})</span><span className="font-medium">{money2(data.consumables)} €</span></div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={exportCSV} data-testid="export-csv-btn" className="px-6 py-3 rounded-full border border-slate-200 hover:bg-slate-50 text-sm flex items-center gap-2"><Download className="w-4 h-4" /> Export CSV</button>
            <button onClick={exportPDF} data-testid="export-pdf-btn" className="px-6 py-3 rounded-full bg-gold-gradient text-white text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Export PDF</button>
            <button onClick={() => resetMonth(yyyymm)} data-testid="reset-month-btn" className="px-6 py-3 rounded-full border border-red-200 text-[#991B1B] hover:bg-red-50 text-sm flex items-center gap-2"><RefreshCcw className="w-4 h-4" /> Remettre ce mois à 0</button>
          </div>
        </>
      )}

      {tab === "urssaf" && (
        <div className="space-y-3">
          <div className="text-sm text-slate-500 max-w-2xl">
            Cotisations URSSAF mensuelles (22% du CA, arrondi supérieur). Cliquez sur « Déclarer le mois » pour ouvrir le site des auto-entrepreneurs.
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
            {months.length === 0 ? <div className="p-6 text-slate-400 text-sm">Aucune donnée pour le moment.</div> :
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500">
                  <tr><th className="p-3 text-left">Mois</th><th className="p-3 text-right">CA</th><th className="p-3 text-right">URSSAF</th><th className="p-3 text-center">Déclaré</th><th className="p-3 text-center">Payé</th><th className="p-3 text-right">Action</th></tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.month} className={`border-t border-slate-100 ${m.declared && m.paid ? "bg-[#166534]/5" : m.declared ? "bg-[#D4AF37]/5" : ""}`}>
                      <td className="p-3 capitalize">{fmtMonth(m.month)}</td>
                      <td className="p-3 text-right">{money2(m.ca)} €</td>
                      <td className="p-3 text-right font-medium">{m.urssaf} €</td>
                      <td className="p-3 text-center">
                        <button onClick={() => setStatus(m.month, { declared: !m.declared })} data-testid={`urssaf-decl-${m.month}`} className={`text-xs px-3 py-1 rounded-full ${m.declared ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>{m.declared ? "Oui" : "Non"}</button>
                      </td>
                      <td className="p-3 text-center">
                        <button onClick={() => setStatus(m.month, { paid: !m.paid })} data-testid={`urssaf-paid-${m.month}`} className={`text-xs px-3 py-1 rounded-full ${m.paid ? "bg-[#166534] text-white" : "border border-slate-200 text-slate-600"}`}>{m.paid ? "Oui" : "Non"}</button>
                      </td>
                      <td className="p-3 text-right">
                        <a href="https://autoentrepreneur.urssaf.fr" target="_blank" rel="noreferrer" data-testid={`urssaf-declare-${m.month}`} className="text-xs bg-gold-gradient text-white px-3 py-1.5 rounded-full inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Déclarer</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </div>
        </div>
      )}

      {tab === "all" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-3">
          {months.length === 0 ? <div className="text-slate-400 text-sm">Aucun historique.</div> :
            months.map((m) => (
              <div key={m.month} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                <div>
                  <div className="font-medium capitalize">{fmtMonth(m.month)}</div>
                  <div className="text-xs text-slate-500">{m.n_rdv} RDV · URSSAF {m.urssaf}€</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-serif text-xl">{money2(m.ca)} €</div>
                  <button onClick={() => resetMonth(m.month)} className="text-xs px-3 py-1 rounded-full border border-red-200 text-[#991B1B] hover:bg-red-50" data-testid={`reset-${m.month}`}>RAZ</button>
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}
