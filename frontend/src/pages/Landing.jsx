import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Scissors, CalendarDays, Route, Users, Package, BarChart3, MessageCircle, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";

const features = [
  [CalendarDays, "Agenda & rendez-vous", "Planifiez vos journées, vos disponibilités et vos demandes de rendez-vous."],
  [Route, "Tournées GPS", "Organisez les déplacements de la journée et réduisez le temps passé sur la route."],
  [Users, "Clients & fidélité", "Fiches clients, historique, cartes de fidélité et messages regroupés au même endroit."],
  [Package, "Stock maîtrisé", "Suivez les produits et anticipez les manques avant vos prochains rendez-vous."],
  [BarChart3, "Chiffre d’affaires", "Visualisez vos résultats, vos dépenses et vos projections de mois, trimestre et année."],
  [MessageCircle, "Équipe connectée", "Échangez avec le responsable, les coiffeurs et les clients dans des conversations simples."]
];

export default function Landing() {
  const { user } = useAuth();
  if (user) return <Navigate to="/app" replace />;

  return (
    <main className="min-h-screen overflow-hidden bg-[#f6f7fb] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#0c1527] to-[#243b61] text-[#e6b648] shadow-lg shadow-slate-900/15"><Scissors size={20}/></span>
            <div><div className="text-base font-extrabold tracking-tight">Coiffure Pro</div><div className="text-xs text-slate-500">L’application des coiffeurs à domicile</div></div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login" className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">Se connecter</Link>
            <Link to="/signup" className="rounded-xl bg-[#111b31] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5">Créer mon entreprise</Link>
          </div>
        </div>
      </header>

      <section className="relative">
        <div className="absolute inset-x-0 top-0 h-[33rem] bg-[radial-gradient(circle_at_76%_24%,rgba(221,170,69,.30),transparent_23%),radial-gradient(circle_at_20%_17%,rgba(92,138,255,.20),transparent_28%),linear-gradient(145deg,#0c1527,#182b4d_58%,#f6f7fb_58%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-20 md:grid-cols-[1.08fr_.92fr] md:pb-28 md:pt-28">
          <div className="text-white">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold tracking-wide backdrop-blur"><Sparkles size={15} className="text-[#f0c75a]"/> PENSÉE POUR LE TRAVAIL À DOMICILE</div>
            <h1 className="max-w-3xl text-5xl font-black leading-[.98] tracking-[-.055em] md:text-7xl">Votre salon, <span className="text-[#f0c75a]">partout</span> avec vous.</h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-200">Gagnez du temps chaque jour : rendez-vous, itinéraires, clients, stock, fidélité, équipe et comptabilité réunis dans une seule application.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/signup" className="inline-flex items-center gap-2 rounded-2xl bg-[#efbe49] px-6 py-4 font-extrabold text-[#111b31] shadow-xl shadow-black/20 transition hover:-translate-y-0.5">Essayer pour mon entreprise <ArrowRight size={18}/></Link>
              <Link to="/login" className="rounded-2xl border border-white/20 bg-white/5 px-6 py-4 font-bold backdrop-blur transition hover:bg-white/10">J’ai déjà un compte</Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300"><span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-[#f0c75a]"/> Cartes de fidélité en ligne</span><span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-[#f0c75a]"/> Sans installation</span></div>
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-8 rounded-[3rem] bg-[#e7bb53]/20 blur-3xl" />
            <div className="relative rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-2xl shadow-slate-950/25 backdrop-blur">
              <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-slate-400">Aujourd’hui</p><p className="mt-1 text-2xl font-black tracking-tight">Une journée maîtrisée</p></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff3d3] text-[#a66f00]"><CalendarDays size={21}/></span></div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-[#f4f6fb] p-4"><p className="text-2xl font-black">6</p><p className="mt-1 text-xs font-semibold text-slate-500">Rendez-vous</p></div>
                <div className="rounded-2xl bg-[#f4f6fb] p-4"><p className="text-2xl font-black">42 €</p><p className="mt-1 text-xs font-semibold text-slate-500">Panier moyen</p></div>
                <div className="rounded-2xl bg-[#f4f6fb] p-4"><p className="text-2xl font-black">19 km</p><p className="mt-1 text-xs font-semibold text-slate-500">Tournée GPS</p></div>
              </div>
              <div className="mt-4 rounded-2xl bg-gradient-to-r from-[#111b31] to-[#263f69] p-5 text-white"><div className="flex items-center gap-3"><Route className="text-[#f0c75a]" size={23}/><div><p className="font-bold">Tournée optimisée</p><p className="mt-1 text-sm text-slate-300">Moins de kilomètres. Plus de rendez-vous.</p></div></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 md:py-28">
        <div className="max-w-2xl"><p className="text-xs font-extrabold tracking-[.18em] text-[#ab760e]">UNE JOURNÉE PLUS SIMPLE</p><h2 className="mt-3 text-4xl font-black tracking-[-.04em] md:text-5xl">Les outils essentiels,<br/>dans un espace clair.</h2><p className="mt-5 text-lg leading-8 text-slate-600">Chaque fonctionnalité est conçue pour vous faire gagner du temps sur le terrain et vous aider à piloter votre entreprise.</p></div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map(([Icon, title, text], index) => <article key={title} className="group rounded-[1.7rem] border border-slate-200/80 bg-white p-6 shadow-[0_15px_45px_-35px_rgba(15,23,42,.5)] transition hover:-translate-y-1 hover:shadow-xl"><span className={"grid h-11 w-11 place-items-center rounded-2xl " + (index === 1 ? "bg-violet-100 text-violet-700" : index === 2 ? "bg-pink-100 text-pink-600" : "bg-amber-100 text-amber-700")}><Icon size={21}/></span><h3 className="mt-5 text-xl font-extrabold tracking-tight">{title}</h3><p className="mt-2 leading-7 text-slate-600">{text}</p></article>)}</div>
      </section>

      <section className="px-5 pb-20"><div className="mx-auto max-w-7xl rounded-[2.3rem] bg-[#111b31] px-7 py-14 text-center text-white shadow-2xl md:px-14"><p className="text-xs font-extrabold tracking-[.18em] text-[#f0c75a]">LE BON OUTIL, AU BON MOMENT</p><h2 className="mx-auto mt-4 max-w-3xl text-4xl font-black tracking-[-.04em] md:text-5xl">Consacrez votre énergie aux clients, pas à l’administratif.</h2><p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">Créez votre espace entreprise et retrouvez votre activité dans une application pensée pour la coiffure à domicile.</p><Link to="/signup" className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-[#efbe49] px-7 py-4 font-extrabold text-[#111b31] transition hover:-translate-y-0.5">Créer mon entreprise <ArrowRight size={18}/></Link></div></section>
    </main>
  );
}
