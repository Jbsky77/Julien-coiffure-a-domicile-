import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, money2, fmtTime, genderClasses, genderLabel } from "@/lib/api";
import { ArrowLeft, Navigation, MapPin, Clock, Car, AlertTriangle, Route, Home, Gift, Fuel } from "lucide-react";

const money = (v) => (Math.round((v || 0) * 100) / 100).toFixed(2);

export default function Tour() {
  const [data, setData] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const r = await api.get(`/tour/today?date=${date}`);
    setData(r.data);
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const buildItineraryUrl = (addr) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;

  const fullTourUrl = (() => {
    if (!data?.stops?.length) return null;
    const waypoints = data.stops.slice(0, -1).map((s) => encodeURIComponent(s.address)).filter(Boolean).join("|");
    const dest = encodeURIComponent(data.stops[data.stops.length - 1].address || "");
    if (!dest) return null;
    let url = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    if (waypoints) url += `&waypoints=${waypoints}`;
    return url;
  })();

  const goPrev = () => {
    const d = new Date(date); d.setDate(d.getDate() - 1);
    setDate(d.toISOString().slice(0, 10));
  };
  const goNext = () => {
    const d = new Date(date); d.setDate(d.getDate() + 1);
    setDate(d.toISOString().slice(0, 10));
  };
  const goToday = () => setDate(new Date().toISOString().slice(0, 10));

  if (!data) return <div className="text-slate-500">Chargement…</div>;

  return (
    <div className="space-y-6" data-testid="tour-page">
      <button onClick={() => navigate(-1)} className="text-sm text-slate-500 flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Retour</button>
      <div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Tournée du jour</div>
        <h1 className="font-serif text-3xl tracking-tight">Ma journée</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={goPrev} data-testid="tour-prev" className="text-xs px-3 py-1.5 rounded-full border border-slate-200">← Veille</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="tour-date" className="bg-transparent border-b border-slate-300 px-0 py-2 focus:border-[#0A192F] focus:outline-none" />
        <button onClick={goNext} data-testid="tour-next" className="text-xs px-3 py-1.5 rounded-full border border-slate-200">Lendemain →</button>
        <button onClick={goToday} data-testid="tour-today" className="text-xs px-3 py-1.5 rounded-full border border-slate-200">Aujourd&apos;hui</button>
      </div>

      {!data.business_geocoded && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2">
          Adresse professionnelle non vérifiée — les distances de tournée sont approximatives. <button onClick={() => navigate("/reglages")} className="underline">Configurer</button>
        </div>
      )}

      {/* KPIs — premier niveau */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">Rendez-vous</div><div className="font-serif text-2xl text-blue-700">{data.stops.length}</div></div>
        <div className="bg-gradient-to-br from-[#D4AF37]/10 to-white border border-[#D4AF37]/30 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">CA prévu</div><div className="font-serif text-2xl text-[#C5A059]">{money2(data.total_ca)} €</div></div>
        <div className="bg-gradient-to-br from-pink-50 to-white border border-pink-100 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">Prestation</div><div className="font-serif text-2xl text-pink-600">{Math.floor(data.total_duration_min / 60)}h{String(data.total_duration_min % 60).padStart(2, "0")}</div></div>
        <div className="bg-gradient-to-br from-green-50 to-white border border-green-100 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">Trajet réel</div><div className="font-serif text-2xl text-green-700">{Math.round(data.total_travel_min)} min</div><div className="text-[10px] text-slate-500">{money2(data.total_km)} km</div></div>
      </div>

      {/* KPIs financiers — second niveau */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="tour-financials">
        <div className="bg-white border border-slate-100 rounded-2xl p-3">
          <div className="text-[10px] uppercase tracking-widest text-slate-500">Prestations</div>
          <div className="font-serif text-lg">{money2(data.ca_services)} €</div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-3">
          <div className="text-[10px] uppercase tracking-widest text-slate-500">Suppl. théoriques</div>
          <div className="font-serif text-lg text-slate-500 line-through">{money2(data.theoretical_supplements)} €</div>
          <div className="font-serif text-lg text-[#0A192F]" data-testid="billed-supp">{money2(data.billed_supplements)} € facturés</div>
        </div>
        <div className="bg-[#D4AF37]/5 border border-[#D4AF37]/30 rounded-2xl p-3">
          <div className="text-[10px] uppercase tracking-widest text-[#8A6A1F] flex items-center gap-1"><Gift className="w-3 h-3" /> Remises Voisin</div>
          <div className="font-serif text-lg text-[#8A6A1F]" data-testid="neighbor-total">−{money2(data.neighbor_discounts)} €</div>
          <div className="text-[10px] text-slate-500">{data.neighbor_count} exonération{data.neighbor_count > 1 ? "s" : ""}</div>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-3">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 flex items-center gap-1"><Fuel className="w-3 h-3" /> Carburant réel</div>
          <div className="font-serif text-lg text-[#991B1B]" data-testid="fuel-cost">{data.fuel_cost} €</div>
          <div className="text-[10px] text-slate-500">brut {money2(data.fuel_cost_brut)} € · arrondi ↑</div>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-baseline justify-between" data-testid="tour-margin">
        <div className="text-sm text-slate-500">Marge estimée (CA − carburant − consommables)</div>
        <div className="font-serif text-2xl text-[#0A192F]">{money2(data.estimated_margin)} €</div>
      </div>

      {fullTourUrl && (
        <a href={fullTourUrl} target="_blank" rel="noopener noreferrer" data-testid="open-full-tour" className="w-full bg-gold-gradient text-white rounded-full px-6 py-3 font-medium flex items-center justify-center gap-2"><Route className="w-4 h-4" /> Itinéraire complet</a>
      )}

      {data.stops.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center space-y-3" data-testid="empty-tour">
          <div className="text-slate-400 text-sm">Aucun rendez-vous ce jour.</div>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={() => navigate("/rdv/nouveau")} data-testid="empty-new-rdv" className="text-xs px-4 py-2 rounded-full bg-[#0A192F] text-white">+ Nouveau RDV</button>
            <button onClick={goNext} data-testid="empty-tomorrow" className="text-xs px-4 py-2 rounded-full border border-slate-200">Voir demain →</button>
            <button onClick={goToday} data-testid="empty-today" className="text-xs px-4 py-2 rounded-full border border-slate-200">Aujourd&apos;hui</button>
          </div>
        </div>
      ) : (
        <ol className="space-y-3">
          {data.stops.map((s, i) => {
            const gc = genderClasses(s.gender);
            return (
              <li key={s.id}>
                <div className={`flex items-center gap-3 px-4 py-2 my-2 rounded-xl ${s.conflict ? "bg-red-50 border border-red-200" : "bg-slate-50"}`} data-testid={`travel-${i}`}>
                  {s.conflict ? <AlertTriangle className="w-4 h-4 text-[#991B1B]" /> : s.leg_from_business ? <Home className="w-4 h-4 text-slate-500" /> : <Car className="w-4 h-4 text-slate-500" />}
                  <div className={`text-xs ${s.conflict ? "text-[#991B1B]" : "text-slate-600"}`}>
                    {s.leg_from_business && "Départ adresse pro · "}
                    {s.travel_km !== null ? `Trajet ~${Math.round(s.travel_min)} min · ${money2(s.travel_km)} km` : "Adresse manquante"}
                    {s.conflict && " — Conflit probable"}
                  </div>
                </div>
                <div
                  className={`${gc.bg} border-2 ${gc.border} rounded-2xl p-4 cursor-pointer hover:shadow-premium transition-all focus:outline-none focus:ring-2 focus:ring-[#D4AF37]`}
                  data-testid={`tour-stop-${i}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Ouvrir le rendez-vous de ${s.client_name}`}
                  onClick={(event) => {
                    if (!event.target.closest("a,button")) navigate(`/rdv/${s.id}`);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") navigate(`/rdv/${s.id}`);
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#0A192F] text-white flex items-center justify-center font-serif text-lg">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-3.5 h-3.5 text-[#1E3A8A]" />
                        <div className="font-medium">{fmtTime(s.date)}</div>
                        <span className="text-xs text-slate-500">· {s.duration_minutes} min</span>
                        {s.is_neighbor && (
                          <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#8A6A1F] border border-[#D4AF37]/40 flex items-center gap-1" data-testid={`badge-voisin-${i}`}>
                            <Gift className="w-3 h-3" /> Voisin — déplacement offert
                          </span>
                        )}
                      </div>
                      <div className="font-serif text-lg">{genderLabel(s.gender) && <span className="text-slate-500 text-sm mr-1">{genderLabel(s.gender)}</span>}{s.client_name}</div>
                      {s.address && (
                        <div className="text-xs text-slate-500 flex items-start gap-1 mt-1"><MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" /> {s.address}</div>
                      )}
                      <div className="text-xs text-slate-500 mt-1 truncate">{s.services.map((x) => x.name).join(", ")}</div>
                      {(s.theoretical_supplement > 0 || s.billed_supplement > 0) && (
                        <div className="text-[10px] text-slate-500 mt-1">
                          Suppl. théorique {money(s.theoretical_supplement)} € · facturé <span className="font-medium text-[#0A192F]">{money(s.billed_supplement)} €</span>
                          {s.neighbor_discount > 0 && <> · <span className="text-[#8A6A1F]">−{money(s.neighbor_discount)} € voisin</span></>}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-3">
                        <div className="font-serif text-xl text-[#C5A059]">{money2(s.price_final)} €</div>
                        {s.address && (
                          <a href={buildItineraryUrl(s.address)} target="_blank" rel="noopener noreferrer" data-testid={`itinerary-${i}`} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-[#0A192F] text-white"><Navigation className="w-3 h-3" /> Itinéraire</a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
          {data.return_leg_km !== null && data.return_leg_km !== undefined && (
            <li>
              <div className="flex items-center gap-3 px-4 py-2 my-2 rounded-xl bg-slate-50" data-testid="return-leg">
                <Home className="w-4 h-4 text-slate-500" />
                <div className="text-xs text-slate-600">
                  Retour adresse pro · ~{Math.round(data.return_leg_min)} min · {money2(data.return_leg_km)} km
                </div>
              </div>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
