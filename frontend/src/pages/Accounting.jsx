import React, { useCallback, useEffect, useState } from "react";
import { api, money, money2, fmtMonth } from "@/lib/api";
import { toast } from "sonner";
import { ExternalLink, RefreshCcw, ChevronLeft, ChevronRight, Download, FileText, CreditCard, Pencil, Save } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PAYMENT_MODES } from "@/lib/api";

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
  const [cbPeriod, setCbPeriod] = useState("month");
  const [cbData, setCbData] = useState(null);
  const [selectedReset, setSelectedReset] = useState([]);
  // Paiements tab
  const [payments, setPayments] = useState([]);
  const [payPeriod, setPayPeriod] = useState("month");
  const [payDay, setPayDay] = useState(new Date().toISOString().slice(0, 10));
  const [payMonth, setPayMonth] = useState(currentYYYYMM());
  const [payYear, setPayYear] = useState(String(new Date().getFullYear()));
  const [editingPay, setEditingPay] = useState(null);

  const loadPayments = async () => {
    const r = await api.get("/appointments");
    setPayments(r.data.filter((x) => x.status === "done"));
  };

  const load = useCallback(async () => {
    const [r, m] = await Promise.all([
      api.get(`/accounting/month/${yyyymm}`),
      api.get("/accounting/months"),
    ]);
    setData(r.data);
    setMonths(m.data);
  }, [yyyymm]);
  const loadCbFees = useCallback(async () => {
    const cb = await api.get(`/accounting/cb-fees?period=${cbPeriod}`);
    setCbData(cb.data);
  }, [cbPeriod]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPayments(); }, []);
  useEffect(() => { loadCbFees(); }, [loadCbFees]);

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

  const toggleResetMonth = (m) => {
    setSelectedReset((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  };

  const resetMulti = async () => {
    if (selectedReset.length === 0) return toast.error("Sélectionnez au moins un mois");
    if (!window.confirm(`Supprimer tous les RDV de ${selectedReset.length} mois sélectionné(s) ?`)) return;
    const r = await api.post("/accounting/reset-multi", { months: selectedReset });
    toast.success(`${r.data.deleted} RDV supprimés sur ${selectedReset.length} mois`);
    setSelectedReset([]);
    load();
  };

  const savePayment = async (id, patch) => {
    await api.put(`/appointments/${id}/payment`, patch);
    toast.success("Paiement modifié");
    setEditingPay(null);
    loadPayments();
    load();
  };

  // Filter payments by selected period
  const filteredPayments = payments.filter((p) => {
    const d = new Date(p.finished_at || p.date);
    if (Number.isNaN(d.getTime())) return false;
    if (payPeriod === "all") return true;
    if (payPeriod === "day") return d.toISOString().slice(0, 10) === payDay;
    if (payPeriod === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === payMonth;
    if (payPeriod === "year") return String(d.getFullYear()) === payYear;
    return true;
  }).sort((a, b) => new Date(b.finished_at || b.date) - new Date(a.finished_at || a.date));

  const filteredTotal = filteredPayments.reduce((acc, p) => acc + p.price_final, 0);

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
        {[{ id: "summary", l: "Mois en cours" }, { id: "payments", l: "Paiements" }, { id: "cb", l: "Frais CB" }, { id: "urssaf", l: "URSSAF" }, { id: "reset", l: "Réinitialiser" }, { id: "all", l: "Historique" }].map((t) => (
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

          <div className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center gap-4" data-testid="cb-fees-summary">
            <div className="w-12 h-12 rounded-full bg-[#D4AF37]/10 flex items-center justify-center"><CreditCard className="w-5 h-5 text-[#C5A059]" /></div>
            <div className="flex-1">
              <div className="text-[10px] tracking-widest uppercase text-slate-500">Frais CB ce mois ({(data.cb_fee_rate * 100).toFixed(2).replace(".", ",")}%)</div>
              <div className="text-xs text-slate-500 mt-0.5">{data.cb_count} transaction(s) CB · {money2(data.cb_amount)} € encaissés</div>
            </div>
            <div className="text-right">
              <div className="font-serif text-2xl text-[#991B1B]">-{money2(data.cb_fees_total)} €</div>
              <button onClick={() => setTab("cb")} className="text-[10px] uppercase tracking-widest text-[#1E3A8A] hover:underline" data-testid="cb-details-link">Détails cumul</button>
            </div>
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

      {tab === "payments" && (
        <div className="space-y-4" data-testid="payments-tab">
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-premium space-y-4">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-[#1E3A8A]" />
              <div className="font-serif text-xl">Paiements encaissés</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[{ id: "day", l: "Jour" }, { id: "month", l: "Mois" }, { id: "year", l: "Année" }, { id: "all", l: "Tout" }].map((p) => (
                <button key={p.id} onClick={() => setPayPeriod(p.id)} data-testid={`pay-period-${p.id}`} className={`px-4 py-2 rounded-full text-sm ${payPeriod === p.id ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>{p.l}</button>
              ))}
            </div>
            {payPeriod === "day" && <input type="date" value={payDay} onChange={(e) => setPayDay(e.target.value)} data-testid="pay-day-input" className="bg-transparent border-b border-slate-300 px-0 py-2 focus:border-[#0A192F] focus:outline-none" />}
            {payPeriod === "month" && <input type="month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} data-testid="pay-month-input" className="bg-transparent border-b border-slate-300 px-0 py-2 focus:border-[#0A192F] focus:outline-none" />}
            {payPeriod === "year" && <input type="number" min="2020" max="2099" value={payYear} onChange={(e) => setPayYear(e.target.value)} data-testid="pay-year-input" className="bg-transparent border-b border-slate-300 px-0 py-2 focus:border-[#0A192F] focus:outline-none w-32" />}
            <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-500">{filteredPayments.length} paiement(s)</div>
              <div className="font-serif text-2xl text-[#C5A059]">{money2(filteredTotal)} €</div>
            </div>
          </div>

          {filteredPayments.length === 0 ? (
            <div className="text-slate-400 text-sm py-10 text-center">Aucun paiement sur cette période.</div>
          ) : (
            <ul className="space-y-2">
              {filteredPayments.map((p) => {
                const isEditing = editingPay?.id === p.id;
                const dt = new Date(p.finished_at || p.date);
                const dateStr = dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
                const timeStr = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                if (isEditing) {
                  return (
                    <li key={p.id} className="bg-white border-2 border-[#1E3A8A] rounded-2xl p-4 space-y-3" data-testid={`pay-edit-${p.id}`}>
                      <div className="font-medium">{p.client_name}</div>
                      <div className="text-xs text-slate-500">{dateStr} · {timeStr}</div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-slate-500">Mode de règlement</label>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {PAYMENT_MODES.map((m) => (
                            <button key={m.id} onClick={() => setEditingPay({ ...editingPay, payment_mode: m.id })} data-testid={`edit-pm-${m.id}`} className={`px-3 py-1.5 rounded-full text-xs ${editingPay.payment_mode === m.id ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>{m.label}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-slate-500">Montant (€)</label>
                        <input type="number" step="0.01" value={editingPay.price_final} onChange={(e) => setEditingPay({ ...editingPay, price_final: parseFloat(e.target.value) || 0 })} data-testid="edit-pay-amount" className="w-full bg-transparent border-b border-slate-300 px-0 py-2 focus:border-[#0A192F] focus:outline-none" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => savePayment(p.id, { payment_mode: editingPay.payment_mode, price_final: editingPay.price_final })} data-testid="save-pay-btn" className="bg-[#0A192F] text-white rounded-full px-5 py-2 text-sm flex items-center gap-2"><Save className="w-3.5 h-3.5" /> Enregistrer</button>
                        <button onClick={() => setEditingPay(null)} className="rounded-full border border-slate-200 px-5 py-2 text-sm">Annuler</button>
                      </div>
                    </li>
                  );
                }
                const pmColor = p.payment_mode === "CB" ? "bg-blue-50 text-blue-700 border-blue-200" : p.payment_mode === "ESPECES" ? "bg-green-50 text-green-700 border-green-200" : p.payment_mode === "CHEQUE" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-slate-50 text-slate-700 border-slate-200";
                return (
                  <li key={p.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-3 hover:shadow-premium transition-all" data-testid={`pay-row-${p.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.client_name}</div>
                      <div className="text-xs text-slate-500">{dateStr} · {timeStr}</div>
                    </div>
                    <span className={`text-[9px] tracking-wider uppercase px-2 py-1 rounded-full border ${pmColor}`}>{p.payment_mode}</span>
                    <div className="font-serif text-lg w-20 text-right">{money2(p.price_final)} €</div>
                    <button onClick={() => setEditingPay({ id: p.id, payment_mode: p.payment_mode, price_final: p.price_final })} data-testid={`edit-pay-${p.id}`} className="rounded-full p-2 text-slate-500 hover:bg-slate-50 hover:text-[#0A192F]"><Pencil className="w-4 h-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === "cb" && cbData && (
        <div className="space-y-4" data-testid="cb-tab">
          <div className="bg-white border border-slate-100 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#D4AF37]/10 flex items-center justify-center"><CreditCard className="w-5 h-5 text-[#C5A059]" /></div>
              <div>
                <div className="text-[10px] tracking-widest uppercase text-slate-500">Frais CB · Taux {(cbData.rate * 100).toFixed(2).replace(".", ",")}%</div>
                <div className="font-serif text-xl">Commission bancaire prélevée</div>
              </div>
            </div>
            <div className="flex gap-2 mb-5">
              {[{ id: "day", l: "Jour" }, { id: "month", l: "Mois" }, { id: "year", l: "Année" }].map((p) => (
                <button key={p.id} onClick={() => setCbPeriod(p.id)} data-testid={`cb-period-${p.id}`} className={`px-4 py-2 rounded-full text-sm ${cbPeriod === p.id ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>{p.l}</button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-slate-50 rounded-xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">Transactions CB</div><div className="font-serif text-xl mt-1">{cbData.total_count}</div></div>
              <div className="bg-slate-50 rounded-xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">Encaissé CB</div><div className="font-serif text-xl mt-1">{money2(cbData.total_amount)} €</div></div>
              <div className="bg-red-50 rounded-xl p-4"><div className="text-[10px] uppercase tracking-widest text-[#991B1B]">Frais CB cumulés</div><div className="font-serif text-xl mt-1 text-[#991B1B]">-{money2(cbData.total_fees)} €</div></div>
            </div>
            {cbData.rows.length === 0 ? <div className="text-slate-400 text-sm">Aucune transaction CB.</div> :
              <ul className="divide-y divide-slate-100">
                {cbData.rows.map((r) => (
                  <li key={r.key} className="py-3 grid grid-cols-4 gap-2 items-center text-sm" data-testid={`cb-row-${r.key}`}>
                    <div className="font-medium">{r.key}</div>
                    <div className="text-slate-500">{r.count} transaction(s)</div>
                    <div className="text-slate-500">{money2(r.amount)} € encaissés</div>
                    <div className="text-right font-medium text-[#991B1B]">-{money2(r.fees)} €</div>
                  </li>
                ))}
              </ul>
            }
          </div>
        </div>
      )}

      {tab === "reset" && (
        <div className="space-y-4" data-testid="reset-tab">
          <div className="bg-white border border-slate-100 rounded-2xl p-6">
            <div className="text-[10px] tracking-widest uppercase text-slate-500 mb-3">Réinitialiser des mois</div>
            <div className="text-sm text-slate-500 mb-5">Sélectionnez les mois à remettre à 0. Tous les RDV terminés de ces mois seront <strong>définitivement supprimés</strong>.</div>
            {months.length === 0 ? <div className="text-slate-400 text-sm py-4">Aucun mois avec des données.</div> :
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-5">
                {months.map((m) => {
                  const checked = selectedReset.includes(m.month);
                  return (
                    <label key={m.month} data-testid={`reset-check-${m.month}`} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${checked ? "border-[#991B1B] bg-red-50" : "border-slate-200"}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleResetMonth(m.month)} className="w-4 h-4 accent-[#991B1B]" />
                      <div className="flex-1">
                        <div className="font-medium capitalize">{fmtMonth(m.month)}</div>
                        <div className="text-xs text-slate-500">{m.n_rdv} RDV · {money2(m.ca)} €</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            }
            <div className="flex flex-wrap gap-2 items-center">
              <button onClick={() => setSelectedReset(months.map((m) => m.month))} data-testid="reset-select-all" className="text-xs px-3 py-1.5 rounded-full border border-slate-200 hover:bg-slate-50">Tout cocher</button>
              <button onClick={() => setSelectedReset([])} data-testid="reset-deselect" className="text-xs px-3 py-1.5 rounded-full border border-slate-200 hover:bg-slate-50">Tout décocher</button>
              <div className="flex-1" />
              <button onClick={resetMulti} disabled={selectedReset.length === 0} data-testid="reset-multi-btn" className="px-6 py-3 rounded-full bg-[#991B1B] text-white text-sm disabled:opacity-40 flex items-center gap-2"><RefreshCcw className="w-4 h-4" /> Réinitialiser {selectedReset.length > 0 ? `(${selectedReset.length})` : ""}</button>
            </div>
          </div>
        </div>
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
