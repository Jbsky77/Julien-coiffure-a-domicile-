import React, { useEffect, useState } from "react";
import { KeyRound, Scissors } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session || null);
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return;
      setSession(nextSession);
      setChecking(false);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (password.length < 8) return toast.error("Le mot de passe doit contenir au moins 8 caractères");
    if (password !== confirmation) return toast.error("Les deux mots de passe sont différents");
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Votre accès employé est activé");
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(error.message || "Impossible d'activer votre accès");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-100 shadow-premium p-7 md:p-9">
        <div className="flex items-center gap-3 mb-8">
          <Scissors className="w-6 h-6 text-[#D4AF37]" strokeWidth={1.5} />
          <div className="font-serif text-2xl">Coiffure Pro</div>
        </div>
        <div className="w-12 h-12 rounded-full bg-[#0A192F] text-white flex items-center justify-center mb-5">
          <KeyRound className="w-5 h-5" />
        </div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Invitation employé</div>
        <h1 className="font-serif text-4xl tracking-tight mb-3">Choisissez votre mot de passe</h1>
        <p className="text-sm text-slate-500 mb-7">Il vous permettra ensuite de vous connecter avec votre adresse e-mail professionnelle.</p>

        {checking ? (
          <div className="text-sm text-slate-500">Vérification de l'invitation…</div>
        ) : !session ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              Ce lien d'invitation est invalide ou a expiré. Demandez une nouvelle invitation.
            </div>
            <button onClick={() => navigate("/login")} className="w-full border border-slate-200 rounded-full px-6 py-3">
              Aller à la connexion
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5" data-testid="accept-invite-form">
            <label className="block text-sm">
              <span className="text-slate-600">Nouveau mot de passe</span>
              <input
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-[#0A192F]"
                data-testid="invite-password"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Confirmez le mot de passe</span>
              <input
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="mt-2 w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-[#0A192F]"
                data-testid="invite-password-confirm"
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-[#0A192F] text-white rounded-full px-6 py-4 font-medium disabled:opacity-50"
              data-testid="invite-activate"
            >
              {saving ? "Activation…" : "Activer mon accès"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
