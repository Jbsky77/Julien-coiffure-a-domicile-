import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Scissors } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export default function Signup() {
  const [form, setForm] = useState({ company_name: "", first_name: "", last_name: "", siret: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) return toast.error("Le mot de passe doit contenir au moins 8 caractères.");
    if (form.password !== form.confirm) return toast.error("Les mots de passe ne correspondent pas.");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: form.email.trim(), password: form.password,
      options: { emailRedirectTo: window.location.origin + "/login", data: { company_name: form.company_name.trim(), first_name: form.first_name.trim(), last_name: form.last_name.trim(), full_name: (form.first_name + " " + form.last_name).trim(), siret: form.siret.replace(/\s/g, ""), role: "owner" } }
    });
    setLoading(false);
    if (error) return toast.error(error.message || "Inscription impossible.");
    setDone(true);
  };
  if (done) return <main className="min-h-screen bg-slate-50 grid place-items-center px-5"><section className="max-w-lg rounded-3xl bg-white p-10 text-center shadow-xl"><Scissors className="mx-auto text-[#D4AF37]" size={40}/><h1 className="mt-5 font-serif text-4xl">Vérifiez votre e-mail</h1><p className="mt-4 leading-7 text-slate-600">Un lien de confirmation a été envoyé à <b>{form.email}</b>. Cliquez dessus pour activer votre entreprise.</p><Link to="/login" className="mt-7 inline-block rounded-full bg-[#0A192F] px-7 py-3 font-bold text-white">Retour à la connexion</Link></section></main>;
  return <main className="min-h-screen bg-slate-50 px-5 py-12"><section className="mx-auto max-w-2xl rounded-3xl bg-white p-7 shadow-xl md:p-10"><div className="flex items-center gap-3"><Scissors className="text-[#D4AF37]"/><span className="font-serif text-2xl">Créer mon entreprise</span></div><p className="mt-3 text-slate-600">Commencez à organiser votre activité de coiffure à domicile.</p>
    <form onSubmit={submit} className="mt-8 grid gap-5 md:grid-cols-2">
      <label className="md:col-span-2">Nom de l’entreprise<input required name="company_name" value={form.company_name} onChange={change} className="mt-2 w-full rounded-xl border p-3"/></label>
      <label>Prénom<input required name="first_name" value={form.first_name} onChange={change} className="mt-2 w-full rounded-xl border p-3"/></label><label>Nom<input required name="last_name" value={form.last_name} onChange={change} className="mt-2 w-full rounded-xl border p-3"/></label>
      <label className="md:col-span-2">Numéro SIRET<input name="siret" value={form.siret} onChange={change} inputMode="numeric" maxLength={14} className="mt-2 w-full rounded-xl border p-3" placeholder="14 chiffres"/></label>
      <label className="md:col-span-2">Adresse e-mail<input required type="email" name="email" value={form.email} onChange={change} className="mt-2 w-full rounded-xl border p-3"/></label>
      <label>Mot de passe<input required type="password" name="password" value={form.password} onChange={change} className="mt-2 w-full rounded-xl border p-3"/></label><label>Confirmer<input required type="password" name="confirm" value={form.confirm} onChange={change} className="mt-2 w-full rounded-xl border p-3"/></label>
      <button disabled={loading} className="md:col-span-2 rounded-full bg-[#0A192F] px-7 py-4 font-bold text-white disabled:opacity-50">{loading ? "Création…" : "Créer mon compte entreprise"}</button>
    </form><p className="mt-6 text-center text-sm text-slate-600">Vous avez déjà un compte ? <Link to="/login" className="font-bold text-[#0A192F]">Se connecter</Link></p></section></main>;
}

