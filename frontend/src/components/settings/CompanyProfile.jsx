import React, { useEffect, useState } from "react";
import { Building2, ImagePlus, Save } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export default function CompanyProfile() {
  const { activeCompany, refreshCompanies } = useAuth();
  const canManage = ["owner", "admin"].includes(activeCompany?.role);
  const [form, setForm] = useState({
    name: "",
    legal_name: "",
    siret: "",
    email: "",
    phone: "",
    logo_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setForm({
      name: activeCompany?.name || "",
      legal_name: activeCompany?.legal_name || "",
      siret: activeCompany?.siret || "",
      email: activeCompany?.email || "",
      phone: activeCompany?.phone || "",
      logo_url: activeCompany?.logo_url || "",
    });
  }, [activeCompany]);

  if (!canManage) return null;

  const save = async (event) => {
    event.preventDefault();
    const siret = form.siret.replace(/\s/g, "");
    if (siret && !/^\d{14}$/.test(siret)) {
      toast.error("Le SIRET doit contenir exactement 14 chiffres");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Le nom de l’entreprise est obligatoire");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          name: form.name.trim(),
          legal_name: form.legal_name.trim() || null,
          siret: siret || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          logo_url: form.logo_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeCompany.id);
      if (error) throw error;
      await refreshCompanies();
      toast.success("Identité de l’entreprise enregistrée");
    } catch (error) {
      toast.error(error.message || "Impossible d’enregistrer l’entreprise");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      toast.error("Utilisez une image PNG, JPG, WebP ou SVG");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Le logo ne doit pas dépasser 2 Mo");
      return;
    }

    setUploading(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const objectPath = `${activeCompany.id}/logo.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(objectPath, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("company-logos").getPublicUrl(objectPath);
      const logoUrl = `${data.publicUrl}?v=${Date.now()}`;
      const { error: updateError } = await supabase
        .from("companies")
        .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
        .eq("id", activeCompany.id);
      if (updateError) throw updateError;
      setForm((current) => ({ ...current, logo_url: logoUrl }));
      await refreshCompanies();
      toast.success("Logo ajouté");
    } catch (error) {
      toast.error(error.message || "Impossible d’ajouter le logo");
    } finally {
      setUploading(false);
    }
  };

  const fieldClass = "mt-2 w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-[#0A192F]";

  return (
    <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-premium" data-testid="company-profile-section">
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center"><Building2 className="w-5 h-5 text-blue-800" /></div>
        <div>
          <div className="text-[10px] tracking-widest uppercase text-slate-500">Votre entreprise</div>
          <h2 className="font-serif text-2xl">Identité et logo</h2>
          <p className="text-sm text-slate-500 mt-1">Ce nom et ce logo apparaissent dans l’application de votre équipe.</p>
        </div>
      </div>

      <form onSubmit={save} className="space-y-5">
        <div className="flex flex-col sm:flex-row items-start gap-5 rounded-2xl bg-slate-50 p-4">
          {form.logo_url ? (
            <img src={form.logo_url} alt="Logo de l’entreprise" className="w-24 h-24 rounded-2xl object-contain bg-white border border-slate-200" />
          ) : (
            <div className="w-24 h-24 rounded-2xl bg-white border border-dashed border-slate-300 flex items-center justify-center"><ImagePlus className="w-7 h-7 text-slate-400" /></div>
          )}
          <div className="flex-1">
            <div className="font-medium">Logo de l’entreprise</div>
            <div className="text-xs text-slate-500 mt-1 mb-4">PNG, JPG, WebP ou SVG · 2 Mo maximum</div>
            <label className="inline-flex cursor-pointer border border-slate-200 bg-white rounded-full px-5 py-2.5 text-sm font-medium">
              {uploading ? "Envoi en cours…" : "Choisir un logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={uploadLogo} disabled={uploading} className="sr-only" data-testid="company-logo-input" />
            </label>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="text-sm">Nom affiché<input className={fieldClass} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} data-testid="company-name-input" /></label>
          <label className="text-sm">Raison sociale<input className={fieldClass} value={form.legal_name} onChange={(event) => setForm({ ...form, legal_name: event.target.value })} /></label>
          <label className="text-sm">Numéro SIRET<input className={fieldClass} inputMode="numeric" maxLength={14} value={form.siret} onChange={(event) => setForm({ ...form, siret: event.target.value.replace(/\D/g, "") })} placeholder="14 chiffres" data-testid="company-siret-input" /></label>
          <label className="text-sm">E-mail professionnel<input className={fieldClass} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label className="text-sm md:col-span-2">Téléphone professionnel<input className={fieldClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        </div>
        <button type="submit" disabled={saving} className="bg-[#0A192F] text-white rounded-full px-6 py-3 font-medium flex items-center gap-2 disabled:opacity-50" data-testid="company-profile-save">
          <Save className="w-4 h-4" /> {saving ? "Enregistrement…" : "Enregistrer l’entreprise"}
        </button>
      </form>
    </section>
  );
}
