import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [valid, setValid] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setValid(Boolean(data.session)); setChecking(false); });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) { setValid(true); setChecking(false); }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const submit = async (event) => {
    event.preventDefault();
    if (password.length < 8 || password !== confirmation) return toast.error("VÃ©rifiez les deux mots de passe (8 caractÃ¨res minimum).");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return toast.error(error.message);
    await supabase.auth.signOut({ scope: "local" });
    toast.success("Mot de passe modifiÃ©");
    navigate("/login", { replace: true });
  };
  return <div className="min-h-screen flex items-center justify-center p-6"><form onSubmit={submit} className="w-full max-w-md bg-white border rounded-3xl p-8 space-y-5"><h1 className="font-serif text-4xl">Nouveau mot de passe</h1>{checking ? <p>VÃ©rificationâ€¦</p> : !valid ? <p>Ce lien est invalide ou expirÃ©.</p> : <><input type="password" required minLength={8} placeholder="Nouveau mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded-xl px-4 py-3"/><input type="password" required minLength={8} placeholder="Confirmation" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="w-full border rounded-xl px-4 py-3"/><button className="w-full bg-[#0A192F] text-white rounded-full p-4">Enregistrer</button></>}</form></div>;
}
