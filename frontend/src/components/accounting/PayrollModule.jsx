import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Download, FileCheck2, FileText, Plus, ReceiptText, RotateCcw, Save, Trash2, UserRound } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { api, money2 } from "@/lib/api";

const currentMonth = () => {
  const date = new Date();
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
};

const EMPTY_PROFILE = {
  member_user_id: "", name: "", email: "", address: "", birth_date: "", entry_date: "",
  employee_type: "employee", contract_type: "CDI", job_title: "", classification: "",
  level: "", step: "", full_time: true, contractual_hours: 151.67, base_salary: 0,
  hourly_rate: 0, withholding_rate: 0, apprentice_contract_start: "",
  apprentice_year: "", apprentice_diploma: "", apprentice_smic_percentage: "",
  contractor_siret: "", notes: "",
};

const EMPTY_PAYROLL = {
  base_salary: 0, normal_hours_amount: 0, overtime_amount: 0, commissions: 0,
  bonuses: 0, tips: 0, benefits_in_kind: 0, absence_deduction: 0,
  employee_contributions: 0, employer_contributions: 0, withholding_tax: 0,
  expenses: 0, advances: 0, other_deductions: 0, net_social: 0,
};

const EMPTY_INVOICE = { quantity: 1, unit_price_ht: 0, vat_rate: 0 };

const PAYROLL_FIELDS = [
  ["base_salary", "Salaire mensuel de base"],
  ["normal_hours_amount", "Heures normales complémentaires"],
  ["overtime_amount", "Heures supplémentaires / complémentaires"],
  ["commissions", "Commissions prestations ou ventes"],
  ["bonuses", "Primes"],
  ["tips", "Pourboires déclarés"],
  ["benefits_in_kind", "Avantages en nature"],
  ["absence_deduction", "Retenue pour absence"],
  ["employee_contributions", "Cotisations salariales — montant validé"],
  ["employer_contributions", "Cotisations patronales — montant validé"],
  ["net_social", "Montant net social — montant validé"],
  ["withholding_tax", "Prélèvement à la source"],
  ["expenses", "Frais et indemnités remboursés"],
  ["advances", "Acomptes"],
  ["other_deductions", "Autres retenues"],
];

const STATUS = {
  draft: ["Brouillon", "bg-amber-100 text-amber-800"],
  validated: ["Validé", "bg-emerald-100 text-emerald-800"],
  cancelled: ["Annulé", "bg-red-100 text-red-800"],
};

const profileTypeLabel = (type) => type === "apprentice" ? "Apprenti" : type === "contractor" ? "Intervenant facturant" : "Salarié";

function downloadDocumentPdf(document) {
  const doc = new jsPDF();
  const payroll = document.kind === "payroll";
  const employer = document.employer_snapshot || {};
  const employee = document.employee_snapshot || {};
  const calculation = document.calculation || {};
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor("#0A192F");
  doc.text(payroll ? "Préparation de bulletin de paie" : "Facture employé / intervenant", 14, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor("#64748B");
  doc.text(document.document_number + " · période " + document.period, 14, 25);
  doc.text("Employeur : " + (employer.legal_name || "Non renseigné") + " · SIRET " + (employer.siret || "non renseigné"), 14, 31);
  doc.text("Bénéficiaire : " + (employee.name || "Non renseigné") + " · " + profileTypeLabel(employee.employee_type), 14, 37);
  const rows = payroll ? [
    ["Salaire brut", money2(calculation.gross || 0) + " €"],
    ["Cotisations salariales", money2(calculation.inputs?.employee_contributions || 0) + " €"],
    ["Montant net social", money2(calculation.net_social || 0) + " €"],
    ["Net avant impôt", money2(calculation.net_before_tax || 0) + " €"],
    ["Prélèvement à la source", money2(calculation.withholding_tax || 0) + " €"],
    ["Frais remboursés", money2(calculation.inputs?.expenses || 0) + " €"],
    ["Net payé", money2(calculation.net_paid || 0) + " €"],
    ["Coût employeur préparé", money2(calculation.employer_cost || 0) + " €"],
  ] : [
    ["Description", document.description || "Prestation"],
    ["Quantité", String(calculation.inputs?.quantity || 0)],
    ["Prix unitaire HT", money2(calculation.inputs?.unit_price_ht || 0) + " €"],
    ["Total HT", money2(calculation.subtotal_ht || 0) + " €"],
    ["TVA (" + money2(calculation.inputs?.vat_rate || 0) + " %)", money2(calculation.vat_amount || 0) + " €"],
    ["Total TTC", money2(calculation.total_ttc || 0) + " €"],
  ];
  autoTable(doc, {
    startY: 44,
    head: [["Élément", "Montant"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [10, 25, 47], textColor: 255 },
    styles: { font: "helvetica", fontSize: 9 },
  });
  const y = Math.min(275, (doc.lastAutoTable?.finalY || 90) + 12);
  doc.setFontSize(8);
  doc.setTextColor("#991B1B");
  doc.text("DOCUMENT PRÉPARATOIRE NON CERTIFIÉ — ne remplace pas un logiciel de paie, un expert-comptable ou une DSN.", 14, y, { maxWidth: 180 });
  doc.setTextColor("#64748B");
  doc.text(payroll ? "À valider avec le professionnel de paie. Le salarié doit conserver son bulletin sans limitation de durée." : "Vérifier les mentions obligatoires et le régime de TVA avant émission.", 14, y + 8, { maxWidth: 180 });
  doc.save(document.document_number + ".pdf");
}

export default function PayrollModule() {
  const [mode, setMode] = useState("payroll");
  const [period, setPeriod] = useState(currentMonth());
  const [members, setMembers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [settings, setSettings] = useState(null);
  const [showEmployer, setShowEmployer] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);
  const [employeeId, setEmployeeId] = useState("");
  const [description, setDescription] = useState("");
  const [payrollValues, setPayrollValues] = useState(EMPTY_PAYROLL);
  const [invoiceValues, setInvoiceValues] = useState(EMPTY_INVOICE);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [memberResponse, profileResponse, documentResponse, settingsResponse] = await Promise.all([
      api.get("/company/members"),
      api.get("/payroll/employees"),
      api.get("/payroll/documents"),
      api.get("/payroll/settings"),
    ]);
    setMembers((memberResponse.data.members || []).filter((member) => member.status === "active"));
    setProfiles(profileResponse.data || []);
    setDocuments(documentResponse.data || []);
    setSettings(settingsResponse.data);
  }, []);

  useEffect(() => { load().catch((error) => toast.error(error.response?.data?.detail || "Module employés indisponible")); }, [load]);

  const visibleDocuments = useMemo(
    () => documents.filter((document) => document.kind === mode && document.period === period),
    [documents, mode, period],
  );

  const chooseMember = (userId) => {
    const member = members.find((item) => item.user_id === userId);
    setProfileForm((current) => ({
      ...current,
      member_user_id: userId,
      name: member?.name || "",
      email: member?.email || "",
    }));
  };

  const newProfile = () => {
    setEditingProfileId(null);
    setProfileForm(EMPTY_PROFILE);
    setShowProfile(true);
  };

  const editProfile = (profile) => {
    setEditingProfileId(profile.id);
    setProfileForm({ ...EMPTY_PROFILE, ...profile });
    setShowProfile(true);
  };

  const saveProfile = async () => {
    if (!profileForm.name.trim()) return toast.error("Le nom de l’employé est obligatoire");
    setSaving(true);
    try {
      const payload = {
        ...profileForm,
        member_user_id: profileForm.member_user_id || null,
        apprentice_year: profileForm.apprentice_year === "" ? null : Number(profileForm.apprentice_year),
        apprentice_smic_percentage: profileForm.apprentice_smic_percentage === "" ? null : Number(profileForm.apprentice_smic_percentage),
        birth_date: profileForm.birth_date || null,
        entry_date: profileForm.entry_date || null,
        apprentice_contract_start: profileForm.apprentice_contract_start || null,
      };
      if (editingProfileId) await api.put("/payroll/employees/" + editingProfileId, payload);
      else await api.post("/payroll/employees", payload);
      toast.success("Fiche employé enregistrée");
      setShowProfile(false);
      await load();
    } catch (error) { toast.error(error.response?.data?.detail || "Enregistrement impossible"); }
    finally { setSaving(false); }
  };

  const saveEmployer = async () => {
    try {
      await api.put("/payroll/settings", settings);
      toast.success("Informations employeur enregistrées");
      setShowEmployer(false);
      await load();
    } catch (error) { toast.error(error.response?.data?.detail || "Enregistrement impossible"); }
  };

  const createDocument = async () => {
    if (!employeeId) return toast.error("Sélectionnez une fiche employé");
    setSaving(true);
    try {
      await api.post("/payroll/documents", {
        employee_id: employeeId,
        kind: mode,
        period,
        payment_date: new Date().toISOString().slice(0, 10),
        description,
        values: mode === "payroll" ? payrollValues : invoiceValues,
      });
      toast.success(mode === "payroll" ? "Préparation de paie créée" : "Facture employé créée");
      setDescription("");
      setPayrollValues(EMPTY_PAYROLL);
      setInvoiceValues(EMPTY_INVOICE);
      await load();
    } catch (error) { toast.error(error.response?.data?.detail || "Création impossible"); }
    finally { setSaving(false); }
  };

  const action = async (document, name) => {
    try {
      if (name === "validate") await api.post("/payroll/documents/" + document.id + "/validate");
      if (name === "rectify") await api.post("/payroll/documents/" + document.id + "/rectify");
      if (name === "delete") await api.delete("/payroll/documents/" + document.id);
      if (name === "cancel") {
        const reason = window.prompt("Motif obligatoire de l’annulation :");
        if (!reason) return;
        await api.post("/payroll/documents/" + document.id + "/cancel", { reason });
      }
      toast.success("Document mis à jour");
      await load();
    } catch (error) { toast.error(error.response?.data?.detail || "Action impossible"); }
  };

  const exportCsv = () => {
    const rows = [["Numéro", "Période", "Type", "Employé", "Statut", "Brut/HT", "Net/TTC"]];
    visibleDocuments.forEach((document) => rows.push([
      document.document_number,
      document.period,
      document.kind,
      document.employee_snapshot?.name || "",
      document.status,
      document.kind === "payroll" ? document.calculation?.gross : document.calculation?.subtotal_ht,
      document.kind === "payroll" ? document.calculation?.net_paid : document.calculation?.total_ttc,
    ]));
    const csv = rows.map((row) => row.map((cell) => '"' + String(cell ?? "").replace(/"/g, '""') + '"').join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "documents-employes-" + period + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!settings) return <div className="text-slate-500">Chargement du module employés…</div>;

  const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5";
  return (
    <div className="space-y-6" data-testid="payroll-module">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-medium text-amber-950">Module préparatoire — paie non certifiée et sans DSN</div>
          <p className="text-sm text-amber-800 mt-1">Les cotisations, le net social et le prélèvement à la source sont saisis en montants validés par votre comptable. Aucun taux légal n’est inventé par l’application.</p>
          <div className="flex flex-wrap gap-3 mt-2 text-xs">
            <a className="underline" target="_blank" rel="noreferrer" href="https://www.urssaf.fr/accueil/employeur/embaucher-gerer-salaries/embaucher/contrat-apprentissage.html">Règles apprentissage — Urssaf</a>
            <a className="underline" target="_blank" rel="noreferrer" href="https://www.legifrance.gouv.fr/conv_coll/id/KALICONT000018563755">Convention coiffure IDCC 2596 — Légifrance</a>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setMode("payroll")} className={"rounded-full px-4 py-2 text-sm flex items-center gap-2 " + (mode === "payroll" ? "bg-[#0A192F] text-white" : "border border-slate-200")}><FileCheck2 className="w-4 h-4" /> Fiches de paie</button>
        <button type="button" onClick={() => setMode("invoice")} className={"rounded-full px-4 py-2 text-sm flex items-center gap-2 " + (mode === "invoice" ? "bg-[#0A192F] text-white" : "border border-slate-200")}><ReceiptText className="w-4 h-4" /> Factures employés</button>
        <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="ml-auto rounded-xl border border-slate-200 bg-white px-3 py-2" aria-label="Période des documents employés" />
      </div>

      <section className="rounded-2xl border border-slate-100 bg-white shadow-premium">
        <button type="button" onClick={() => setShowEmployer(!showEmployer)} className="w-full p-5 flex items-center gap-3 text-left" aria-expanded={showEmployer}>
          <FileText className="w-5 h-5 text-[#C5A059]" />
          <div className="flex-1"><div className="font-medium">Employeur et établissement</div><div className="text-xs text-slate-500">{settings.legal_name || "Informations obligatoires à compléter"} · SIRET {settings.siret || "non renseigné"}</div></div>
          {showEmployer ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showEmployer && <div className="border-t border-slate-100 p-5 grid md:grid-cols-2 gap-3">
          {[["legal_name", "Raison sociale"], ["siret", "SIRET (14 chiffres)"], ["ape_code", "Code APE"], ["urssaf_number", "Numéro Urssaf"], ["department", "Département"], ["municipality", "Commune"], ["mutual_organization", "Organisme de mutuelle"], ["provident_organization", "Organisme de prévoyance"]].map(([key, label]) => <label key={key} className="text-xs text-slate-600">{label}<input value={settings[key] || ""} onChange={(event) => setSettings({ ...settings, [key]: event.target.value })} className={field} /></label>)}
          <label className="text-xs text-slate-600 md:col-span-2">Adresse<textarea value={settings.address || ""} onChange={(event) => setSettings({ ...settings, address: event.target.value })} className={field} rows={2} /></label>
          <label className="text-xs text-slate-600">Effectif<input type="number" min="0" value={settings.workforce || 0} onChange={(event) => setSettings({ ...settings, workforce: Number(event.target.value) })} className={field} /></label>
          <label className="text-xs text-slate-600">Taux AT/MP Carsat (%)<input type="number" min="0" step="0.01" value={settings.accident_rate ?? ""} onChange={(event) => setSettings({ ...settings, accident_rate: event.target.value === "" ? null : Number(event.target.value) })} className={field} /></label>
          <div className="md:col-span-2 flex justify-end"><button type="button" onClick={saveEmployer} className="rounded-full bg-[#0A192F] text-white px-5 py-2.5 flex items-center gap-2"><Save className="w-4 h-4" /> Enregistrer l’employeur</button></div>
        </div>}
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-premium space-y-4">
        <div className="flex items-center gap-3"><UserRound className="w-5 h-5 text-[#1E3A8A]" /><div className="flex-1"><h2 className="font-serif text-2xl">Fiches employés</h2><p className="text-xs text-slate-500">Les numéros de Sécurité sociale et coordonnées bancaires ne sont pas stockés dans cette première version, faute de coffre chiffré dédié.</p></div><button type="button" onClick={newProfile} className="rounded-full border border-slate-200 px-4 py-2 text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Ajouter</button></div>
        {showProfile && <div className="rounded-2xl bg-slate-50 p-4 grid md:grid-cols-3 gap-3">
          {!editingProfileId && <label className="text-xs text-slate-600 md:col-span-3">Compte d’équipe associé<select value={profileForm.member_user_id || ""} onChange={(event) => chooseMember(event.target.value)} className={field}><option value="">Fiche indépendante</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.name} — {member.email}</option>)}</select></label>}
          <label className="text-xs text-slate-600">Nom complet<input value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} className={field} /></label>
          <label className="text-xs text-slate-600">E-mail<input type="email" value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} className={field} /></label>
          <label className="text-xs text-slate-600">Statut<select value={profileForm.employee_type} onChange={(event) => setProfileForm({ ...profileForm, employee_type: event.target.value })} className={field}><option value="employee">Salarié</option><option value="apprentice">Apprenti</option><option value="contractor">Intervenant facturant</option></select></label>
          <label className="text-xs text-slate-600">Date d’entrée<input type="date" value={profileForm.entry_date || ""} onChange={(event) => setProfileForm({ ...profileForm, entry_date: event.target.value })} className={field} /></label>
          <label className="text-xs text-slate-600">Type de contrat<input value={profileForm.contract_type} onChange={(event) => setProfileForm({ ...profileForm, contract_type: event.target.value })} className={field} /></label>
          <label className="text-xs text-slate-600">Emploi<input value={profileForm.job_title} onChange={(event) => setProfileForm({ ...profileForm, job_title: event.target.value })} className={field} /></label>
          <label className="text-xs text-slate-600">Classification<input value={profileForm.classification} onChange={(event) => setProfileForm({ ...profileForm, classification: event.target.value })} className={field} /></label>
          <label className="text-xs text-slate-600">Niveau<input value={profileForm.level} onChange={(event) => setProfileForm({ ...profileForm, level: event.target.value })} className={field} /></label>
          <label className="text-xs text-slate-600">Échelon<input value={profileForm.step} onChange={(event) => setProfileForm({ ...profileForm, step: event.target.value })} className={field} /></label>
          <label className="text-xs text-slate-600">Heures contractuelles mensuelles<input type="number" min="0" step="0.01" value={profileForm.contractual_hours} onChange={(event) => setProfileForm({ ...profileForm, contractual_hours: Number(event.target.value) })} className={field} /></label>
          <label className="text-xs text-slate-600">Salaire mensuel de référence<input type="number" min="0" step="0.01" value={profileForm.base_salary} onChange={(event) => setProfileForm({ ...profileForm, base_salary: Number(event.target.value) })} className={field} /></label>
          {profileForm.employee_type === "apprentice" && <>
            <label className="text-xs text-slate-600">Date de naissance<input type="date" value={profileForm.birth_date || ""} onChange={(event) => setProfileForm({ ...profileForm, birth_date: event.target.value })} className={field} /></label>
            <label className="text-xs text-slate-600">Début du contrat<input type="date" value={profileForm.apprentice_contract_start || ""} onChange={(event) => setProfileForm({ ...profileForm, apprentice_contract_start: event.target.value })} className={field} /></label>
            <label className="text-xs text-slate-600">Année d’exécution<input type="number" min="1" max="4" value={profileForm.apprentice_year ?? ""} onChange={(event) => setProfileForm({ ...profileForm, apprentice_year: event.target.value })} className={field} /></label>
            <label className="text-xs text-slate-600">Diplôme préparé<input value={profileForm.apprentice_diploma} onChange={(event) => setProfileForm({ ...profileForm, apprentice_diploma: event.target.value })} className={field} /></label>
            <label className="text-xs text-slate-600">% du Smic validé<input type="number" min="0" step="0.01" value={profileForm.apprentice_smic_percentage ?? ""} onChange={(event) => setProfileForm({ ...profileForm, apprentice_smic_percentage: event.target.value })} className={field} /></label>
          </>}
          {profileForm.employee_type === "contractor" && <label className="text-xs text-slate-600">SIRET de l’intervenant<input value={profileForm.contractor_siret} onChange={(event) => setProfileForm({ ...profileForm, contractor_siret: event.target.value })} className={field} /></label>}
          <div className="md:col-span-3 flex justify-end gap-2"><button type="button" onClick={() => setShowProfile(false)} className="rounded-full border px-4 py-2">Annuler</button><button type="button" disabled={saving} onClick={saveProfile} className="rounded-full bg-[#0A192F] text-white px-5 py-2">Enregistrer la fiche</button></div>
        </div>}
        <div className="grid md:grid-cols-2 gap-3">{profiles.map((profile) => <button type="button" key={profile.id} onClick={() => editProfile(profile)} className="rounded-2xl border border-slate-200 p-4 text-left hover:bg-slate-50"><div className="font-medium">{profile.name}</div><div className="text-xs text-slate-500">{profileTypeLabel(profile.employee_type)} · {profile.contract_type} · {profile.job_title || "emploi à compléter"}</div></button>)}</div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-premium space-y-4">
        <h2 className="font-serif text-2xl">{mode === "payroll" ? "Préparer la fiche de paie" : "Créer une facture employé"}</h2>
        <label className="text-xs text-slate-600">Employé<select value={employeeId} onChange={(event) => { const id = event.target.value; setEmployeeId(id); const profile = profiles.find((item) => item.id === id); if (profile && mode === "payroll") setPayrollValues((current) => ({ ...current, base_salary: profile.base_salary || 0 })); }} className={field}><option value="">Sélectionner…</option>{profiles.filter((profile) => mode === "invoice" ? profile.employee_type === "contractor" : profile.employee_type !== "contractor").map((profile) => <option key={profile.id} value={profile.id}>{profile.name} — {profileTypeLabel(profile.employee_type)}</option>)}</select></label>
        {mode === "payroll" ? <div className="grid md:grid-cols-3 gap-3">{PAYROLL_FIELDS.map(([key, label]) => <label key={key} className="text-xs text-slate-600">{label}<input type="number" min="0" step="0.01" value={payrollValues[key]} onChange={(event) => setPayrollValues({ ...payrollValues, [key]: Number(event.target.value) })} className={field} /></label>)}</div> : <div className="grid md:grid-cols-3 gap-3">
          <label className="text-xs text-slate-600 md:col-span-3">Description<input value={description} onChange={(event) => setDescription(event.target.value)} className={field} /></label>
          <label className="text-xs text-slate-600">Quantité<input type="number" min="0" step="0.01" value={invoiceValues.quantity} onChange={(event) => setInvoiceValues({ ...invoiceValues, quantity: Number(event.target.value) })} className={field} /></label>
          <label className="text-xs text-slate-600">Prix unitaire HT<input type="number" min="0" step="0.01" value={invoiceValues.unit_price_ht} onChange={(event) => setInvoiceValues({ ...invoiceValues, unit_price_ht: Number(event.target.value) })} className={field} /></label>
          <label className="text-xs text-slate-600">TVA (%)<input type="number" min="0" step="0.01" value={invoiceValues.vat_rate} onChange={(event) => setInvoiceValues({ ...invoiceValues, vat_rate: Number(event.target.value) })} className={field} /></label>
        </div>}
        <button type="button" disabled={saving || profiles.length === 0} onClick={createDocument} className="rounded-full bg-[#0A192F] text-white px-6 py-3 flex items-center gap-2 disabled:opacity-50"><Plus className="w-4 h-4" /> Créer le brouillon</button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-3"><h2 className="font-serif text-2xl flex-1">Historique de {period}</h2><button type="button" onClick={exportCsv} disabled={visibleDocuments.length === 0} className="rounded-full border px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-40"><Download className="w-4 h-4" /> Export comptable</button></div>
        {visibleDocuments.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-slate-500">Aucun document pour cette période.</div> : visibleDocuments.map((document) => {
          const status = STATUS[document.status] || [document.status, "bg-slate-100"];
          const total = document.kind === "payroll" ? document.calculation?.net_paid : document.calculation?.total_ttc;
          return <article key={document.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start gap-3"><div className="flex-1"><div className="font-medium">{document.employee_snapshot?.name}</div><div className="text-xs text-slate-500">{document.document_number} · version {document.version}</div></div><span className={"rounded-full px-3 py-1 text-xs " + status[1]}>{status[0]}</span><div className="font-serif text-2xl">{money2(total || 0)} €</div></div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => downloadDocumentPdf(document)} className="rounded-full border px-3 py-2 text-xs flex items-center gap-1"><Download className="w-3.5 h-3.5" /> PDF</button>
              {document.status === "draft" && <button type="button" onClick={() => action(document, "validate")} className="rounded-full bg-[#166534] text-white px-3 py-2 text-xs flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Valider et figer</button>}
              {document.status === "draft" && <button type="button" onClick={() => action(document, "delete")} className="rounded-full border border-red-200 text-red-700 px-3 py-2 text-xs flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Supprimer</button>}
              {document.status === "validated" && <button type="button" onClick={() => action(document, "cancel")} className="rounded-full border border-red-200 text-red-700 px-3 py-2 text-xs">Annuler avec trace</button>}
              {document.status !== "draft" && <button type="button" onClick={() => action(document, "rectify")} className="rounded-full border px-3 py-2 text-xs flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Rectifier</button>}
            </div>
          </article>;
        })}
      </section>
    </div>
  );
}
