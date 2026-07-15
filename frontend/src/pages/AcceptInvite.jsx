import React, { useEffect, useState } from "react";
import { KeyRound, Scissors } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export default function AcceptInvite() {
  const navigate = useNavigate();
  const companyId = new URLSearchParams(window.location.search).get("company");
  const existingAccount = new URLSearchParams(window.location.search).get("existing") === "1";
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) { setSession(data.session || null); setChecking(false); }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (alive) { setSession(nextSession); setChecking(false); }
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (!existingAccount && password.length < 8) return toast.error("Le mot de passe doit contenir au moins 8 caractères");
    if (!existingAccount && password !== confirmation) return toast.error("Les deux mots de passe sont différents");
    setSaving(true);
    try {
      if (!existingAccount) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      }
      await api.post("/company/members/accept", {}, companyId ? { headers: { "X-Company-ID": companyId } } : undefined);
      toast.success("Votre accès employé est activé");
      window.location.replace("/");
    } catch (error) {
      toast.error(error.response?.data?.detail || error.message || "Impossible d'activer votre accès");
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-100 shadow-premium p-7 md:p-9">
        <div className="flex items-center gap-3 mb-8"><Scissors className="w-6 h-6 text-[#D4AF37]" /><div className="font-serif text-2xl">Coiffure Pro</div></div>
        <KeyRound className="w-10 h-10 mb-5" />
        <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Invitation employé</div>
        <h1 className="font-serif text-4xl tracking-tight mb-3">{existingAccount ? "Acceptez l’invitation" : "Choisissez votre mot de passe"}</h1>
        {checking ? <p>Vérification…</p> : !session ? <p className="rounded-2xl bg-amber-50 p-4">Ce lien est invalide ou a expiré.</p> : (
          <form onSubmit={submit} className="space-y-5">
            {!existingAccount && <>
              <input type="password" minLength={8} required autoComplete="new-password" placeholder="Nouveau mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded-xl px-4 py-3" />
              <input type="password" minLength={8} required autoComplete="new-password" placeholder="Confirmez le mot de passe" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="w-full border rounded-xl px-4 py-3" />
            </>}
            {existingAccount && <p className="text-sm text-slate-600">Votre compte existe déjà. Aucun changement de mot de passe n’est nécessaire.</p>}
            <button disabled={saving} className="w-full bg-[#0A192F] text-white rounded-full px-6 py-4">{saving ? "Activation…" : "Accepter et ouvrir l’entreprise"}</button>
          </form>
        )}
        {!session && !checking && <button onClick={() => navigate("/login")} className="mt-4 w-full border rounded-full px-6 py-3">Connexion</button>}
      </div>
    </div>
  );
}
