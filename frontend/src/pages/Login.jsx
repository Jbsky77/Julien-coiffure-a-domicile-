import React from "react";
import { Scissors } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";

export default function Login() {
  const { user, loading } = useAuth();

  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">…</div>;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-white flex flex-col md:flex-row">
      {/* Left hero */}
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden">
        <img
          src="https://images.pexels.com/photos/13068360/pexels-photo-13068360.jpeg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[#0A192F]/70" />
        <div className="relative z-10 p-16 flex flex-col justify-between text-white w-full">
          <div className="flex items-center gap-3">
            <Scissors className="w-6 h-6 text-[#D4AF37]" strokeWidth={1.25} />
            <div className="font-serif text-2xl">Julien Bouche</div>
          </div>
          <div>
            <div className="text-[11px] tracking-[0.3em] uppercase text-[#D4AF37] mb-4">La coiffure à votre domicile</div>
            <h1 className="font-serif text-5xl leading-[1.05] tracking-tight mb-6">
              Une coiffure sur mesure,<br />
              <span className="italic text-[#D4AF37]">chez vous.</span>
            </h1>
            <p className="text-white/70 max-w-md text-base leading-relaxed">
              L'application de gestion élégante pour votre activité de coiffure à domicile — rendez-vous, clients, comptabilité et fidélité.
            </p>
          </div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-white/40">Premium · Mobile · Artisanal</div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="md:hidden flex items-center gap-2 mb-10">
            <Scissors className="w-6 h-6 text-[#D4AF37]" strokeWidth={1.25} />
            <div className="font-serif text-2xl">Julien Bouche</div>
          </div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-3">Espace Professionnel</div>
          <h2 className="font-serif text-4xl md:text-5xl tracking-tight mb-5">Bienvenue</h2>
          <p className="text-slate-500 mb-10 leading-relaxed">
            Connectez-vous avec votre compte Google pour accéder à votre tableau de bord privé.
          </p>
          <button
            data-testid="google-login-btn"
            onClick={handleLogin}
            className="w-full bg-[#0A192F] text-white rounded-full px-8 py-4 font-medium hover:bg-[#1E3A8A] transition-colors flex items-center justify-center gap-3"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" className="bg-white rounded-full p-0.5">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continuer avec Google
          </button>
          <div className="mt-8 text-center text-xs text-slate-400 tracking-wide">
            En continuant, vous acceptez les conditions d'utilisation.
          </div>
        </div>
      </div>
    </div>
  );
}
