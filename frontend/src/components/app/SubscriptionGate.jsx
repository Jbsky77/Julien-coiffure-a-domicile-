import React from "react";
import { CreditCard, LogOut, ShieldAlert } from "lucide-react";

import { useAuth } from "@/context/AuthContext";

const ACCESS_STATUSES = new Set(["free", "trialing", "active"]);

export default function SubscriptionGate({ children }) {
  const { activeCompany, logout, isPlatformAdmin } = useAuth();
  const subscription = activeCompany?.subscription || {};
  const allowed = isPlatformAdmin || (
    activeCompany?.status === "active"
    && ACCESS_STATUSES.has(subscription.status)
  );

  if (allowed) return children;

  const endDate = subscription.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("fr-FR")
    : null;

  const contactSupport = () => {
    const subject = encodeURIComponent(`Régularisation abonnement — ${activeCompany?.name || "Entreprise"}`);
    window.location.href = `mailto:admin@admin.fr?subject=${subject}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-premium p-7 md:p-10 text-center">
        {activeCompany?.logo_url ? (
          <img src={activeCompany.logo_url} alt="" className="w-16 h-16 rounded-2xl object-contain mx-auto mb-6 border border-slate-100" />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-7 h-7" />
          </div>
        )}
        <div className="text-[10px] uppercase tracking-[0.3em] text-amber-700 mb-3">Accès temporairement suspendu</div>
        <h1 className="font-serif text-4xl tracking-tight mb-3">Paiement requis</h1>
        <p className="text-slate-600 mb-2">
          L’abonnement de <strong>{activeCompany?.name}</strong> doit être régularisé pour continuer à utiliser l’application.
        </p>
        {endDate && <p className="text-sm text-slate-500 mb-2">Dernière échéance : {endDate}</p>}
        {subscription.blocked_reason && <p className="text-sm text-red-700 mb-6">{subscription.blocked_reason}</p>}
        <div className="grid gap-3 mt-8">
          <button type="button" onClick={contactSupport} className="w-full bg-[#0A192F] text-white rounded-full px-6 py-4 font-medium flex items-center justify-center gap-2">
            <CreditCard className="w-4 h-4" /> Régulariser mon abonnement
          </button>
          <button type="button" onClick={logout} className="w-full border border-slate-200 rounded-full px-6 py-3 text-slate-600 flex items-center justify-center gap-2">
            <LogOut className="w-4 h-4" /> Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
