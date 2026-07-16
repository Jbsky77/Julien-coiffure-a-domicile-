import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Scissors, CalendarDays, MapPinned, Users, Package, BarChart3, Route, ShieldCheck } from "lucide-react";

const features = [
  [CalendarDays, "Agenda intelligent", "Centralisez les rendez-vous, les demandes et les disponibilités de votre équipe."],
  [Route, "Tournées optimisées", "Préparez vos déplacements et gagnez du temps grâce à la carte et au GPS."],
  [Users, "Clients et fidélité", "Retrouvez les fiches clients, l’historique et les cartes de fidélité."],
  [Package, "Gestion du stock", "Suivez vos produits et évitez les ruptures avant vos rendez-vous."],
  [BarChart3, "Comptabilité et statistiques", "Pilotez votre chiffre d’affaires, vos dépenses et vos performances."],
  [ShieldCheck, "Multi-entreprises", "Chaque entreprise conserve ses données, ses employés et son identité visuelle."],
];

export default function Landing() {
      const { user } = useAuth();
  if (user) return <Navigate to="/app" replace />;
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#0A192F] text-[#D4AF37]"><Scissors size={21}/></span><div><div className="font-serif text-xl">Coiffure à domicile</div><div className="text-xs text-slate-500">L’outil métier tout-en-un</div></div></div>
      <div className="flex gap-2"><Link to="/login" className="rounded-full px-4 py-2 text-sm font-semibold">Se connecter</Link><Link to="/signup" className="rounded-full bg-[#0A192F] px-5 py-2 text-sm font-semibold text-white">S’inscrire</Link></div>
    </div></header>
    <section className="bg-[#0A192F] text-white"><div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 md:grid-cols-2 md:py-28">
      <div><div className="mb-5 text-xs font-bold uppercase tracking-[.25em] text-[#D4AF37]">Pensée pour les coiffeurs à domicile</div><h1 className="font-serif text-5xl leading-tight md:text-6xl">Moins d’administration.<br/><span className="text-[#D4AF37]">Plus de temps pour vos clients.</span></h1><p className="mt-7 max-w-xl text-lg leading-8 text-slate-300">Rendez-vous, GPS, tournées, clients, stock, comptabilité, employés et fidélité : toute votre activité dans une seule application.</p><div className="mt-9 flex flex-wrap gap-3"><Link to="/signup" className="rounded-full bg-[#D4AF37] px-7 py-4 font-bold text-[#0A192F]">Créer mon entreprise</Link><Link to="/login" className="rounded-full border border-white/30 px-7 py-4 font-semibold">J’ai déjà un compte</Link></div></div>
      <div className="grid place-items-center"><div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-7 shadow-2xl"><MapPinned className="mb-5 text-[#D4AF37]" size={42}/><div className="text-2xl font-semibold">Votre journée, enfin organisée</div><p className="mt-3 leading-7 text-slate-300">Visualisez vos rendez-vous, préparez la meilleure tournée et gardez toutes les informations utiles à portée de main.</p></div></div>
    </div></section>
    <section className="mx-auto max-w-7xl px-5 py-20"><div className="text-center"><h2 className="font-serif text-4xl">Tout pour piloter votre activité</h2><p className="mt-4 text-lg text-slate-600">Une application simple et adaptée au travail en déplacement.</p></div><div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{features.map(([Icon,title,text])=><article key={title} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"><Icon className="text-[#D4AF37]" size={30}/><h3 className="mt-5 text-xl font-bold">{title}</h3><p className="mt-3 leading-7 text-slate-600">{text}</p></article>)}</div></section>
    <section className="bg-white"><div className="mx-auto max-w-5xl px-5 py-20 text-center"><h2 className="font-serif text-4xl">Prêt à gagner du temps ?</h2><p className="mt-4 text-lg text-slate-600">Créez votre entreprise et organisez votre activité dès aujourd’hui.</p><Link to="/signup" className="mt-8 inline-block rounded-full bg-[#0A192F] px-8 py-4 font-bold text-white">Créer mon compte entreprise</Link></div></section>
  </main>;
}
