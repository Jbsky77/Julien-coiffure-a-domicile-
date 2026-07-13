import React, { useEffect, useState } from "react";
import { Scissors } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [checking, setChecking] = useState(true);
  const [validSession, setValidSession] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setValidSession(Boolean(data.session));
        setChecking(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setValidSession(true);
        setChecking(false);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirmation) {
      toast.error("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Votre mot de passe a été modifié.");
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(error.message || "Impossible de modifier le mot de passe.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-slate-200 p-8 md:p-10">
        <div className="flex items-center gap-3 mb-8">
          <Scissors className="w-6 h-6 text-[#D4AF37]" strokeWidth={1.25} />
          <div className="font-serif text-2xl text-[#0A192F]">Julien Bouche</div>
        </div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-3">Compte sécurisé</div>
        <h1 className="font-serif text-4xl tracking-tight mb-4">Nouveau mot de passe</h1>

        {checking ? (
          <p className="text-slate-500">Vérification du lien…</p>
        ) : !validSession ? (
          <div className="space-y-6">
            <p className="text-slate-600">Ce lien est invalide ou a expiré. Demandez un nouvel e-mail depuis la page de connexion.</p>
            <button type="button" onClick={() => navigate("/login")} className="w-full bg-[#0A192F] text-white rounded-full px-8 py-4 font-medium hover:bg-[#1E3A8A]">
              Retour à la connexion
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-6">
            <p className="text-slate-500">Choisissez un mot de passe d’au moins 8 caractères.</p>
            <label className="block text-sm">
              <span className="text-slate-600">Nouveau mot de passe</span>
              <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full border-b border-slate-300 py-3 outline-none focus:border-[#0A192F]" />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Confirmer le mot de passe</span>
              <input type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 w-full border-b border-slate-300 py-3 outline-none focus:border-[#0A192F]" />
            </label>
            <button disabled={submitting} data-testid="reset-password-btn" className="w-full bg-[#0A192F] text-white rounded-full px-8 py-4 font-medium hover:bg-[#1E3A8A] disabled:opacity-50">
              {submitting ? "Modification…" : "Enregistrer le nouveau mot de passe"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
