import React, { useState } from "react";
import { Scissors } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const { user, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sessionMessage] = useState(() => {
    const message = sessionStorage.getItem("jb_login_message");
    sessionStorage.removeItem("jb_login_message");
    return message;
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center">Chargement…</div>;
  if (user) return <Navigate to="/app" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      toast.success("Connexion réussie");
    } catch (error) {
      toast.error(error.message || "Connexion impossible");
    } finally {
      setSubmitting(false);
    }
  };

  const forgotPassword = async () => {
    if (!email.trim()) {
      toast.error("Saisissez d’abord votre adresse e-mail.");
      return;
    }

    setResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Si un compte existe, un e-mail de réinitialisation a été envoyé.");
    } catch (error) {
      toast.error(error.message || "Impossible d’envoyer l’e-mail de réinitialisation.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col md:flex-row">
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden">
        <img src="https://images.pexels.com/photos/13068360/pexels-photo-13068360.jpeg" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-[#0A192F]/70" />
        <div className="relative z-10 p-16 flex flex-col justify-between text-white w-full">
          <div className="flex items-center gap-3"><Scissors className="w-6 h-6 text-[#D4AF37]" strokeWidth={1.25} /><div className="font-serif text-2xl">Coiffure Pro</div></div>
          <div>
            <div className="text-[11px] tracking-[0.3em] uppercase text-[#D4AF37] mb-4">Votre activité, simplement</div>
            <h1 className="font-serif text-5xl leading-[1.05] tracking-tight mb-6">Pilotez votre entreprise,<br /><span className="italic text-[#D4AF37]">en toute sérénité.</span></h1>
            <p className="text-white/70 max-w-md text-base leading-relaxed">Une plateforme sécurisée pour gérer votre activité, votre équipe et vos clients.</p>
          </div>
          {sessionMessage && <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900" role="status">{sessionMessage}</div>}
          <div className="text-[10px] tracking-[0.3em] uppercase text-white/40">Premium · Mobile · Sécurisé</div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <form onSubmit={submit} className="w-full max-w-md space-y-6">
          <div className="md:hidden flex items-center gap-2 mb-10"><Scissors className="w-6 h-6 text-[#D4AF37]" strokeWidth={1.25} /><div className="font-serif text-2xl">Coiffure Pro</div></div>
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-3">Espace professionnel sécurisé</div>
            <h2 className="font-serif text-4xl md:text-5xl tracking-tight mb-5">Bienvenue</h2>
            <p className="text-slate-500">Connectez-vous avec votre compte professionnel.</p>
          </div>
          <label className="block text-sm"><span className="text-slate-600">Adresse e-mail</span><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full border-b border-slate-300 py-3 outline-none focus:border-[#0A192F]" /></label>
          <div>
            <label className="block text-sm"><span className="text-slate-600">Mot de passe</span><input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full border-b border-slate-300 py-3 outline-none focus:border-[#0A192F]" /></label>
            <button type="button" onClick={forgotPassword} disabled={resetting} data-testid="forgot-password-btn" className="mt-3 text-sm text-[#1E3A8A] hover:underline disabled:opacity-50">
              {resetting ? "Envoi en cours…" : "Mot de passe oublié ?"}
            </button>
          </div>
          <button disabled={submitting} data-testid="login-btn" className="w-full bg-[#0A192F] text-white rounded-full px-8 py-4 font-medium hover:bg-[#1E3A8A] disabled:opacity-50">
            {submitting ? "Connexion…" : "Se connecter"}
          </button>
                  <div className="text-center text-sm text-slate-600">Nouvelle entreprise ? <Link to="/signup" className="font-bold text-[#0A192F] hover:underline">S’inscrire</Link></div>
</form>
      </div>
    </div>
  );
}
