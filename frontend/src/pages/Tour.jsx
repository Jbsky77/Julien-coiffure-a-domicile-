import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, money2, fmtTime, genderClasses, genderLabel } from "@/lib/api";
import { ArrowLeft, Navigation, MapPin, Clock, Car, AlertTriangle, Route } from "lucide-react";

export default function Tour() {
  const [data, setData] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const navigate = useNavigate();

  const load = async () => {
    const r = await api.get(`/tour/today?date=${date}`);
    setData(r.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  const openItinerary = (addr) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openFullTour = () => {
    if (!data?.stops?.length) return;
    const waypoints = data.stops.slice(0, -1).map((s) => encodeURIComponent(s.address)).filter(Boolean).join("|");
    const dest = encodeURIComponent(data.stops[data.stops.length - 1].address || "");
    let url = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    if (waypoints) url += `&waypoints=${waypoints}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (!data) return <div className="text-slate-500">Chargement…</div>;

  return (
    <div className="space-y-6" data-testid="tour-page">
      <button onClick={() => navigate(-1)} className="text-sm text-slate-500 flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Retour</button>
      <div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Tournée du jour</div>
        <h1 className="font-serif text-3xl tracking-tight">Ma journée</h1>
      </div>

      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="tour-date" className="bg-transparent border-b border-slate-300 px-0 py-2 focus:border-[#0A192F] focus:outline-none" />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">Rendez-vous</div><div className="font-serif text-2xl text-blue-700">{data.stops.length}</div></div>
        <div className="bg-gradient-to-br from-[#D4AF37]/10 to-white border border-[#D4AF37]/30 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">CA prévu</div><div className="font-serif text-2xl text-[#C5A059]">{money2(data.total_ca)} €</div></div>
        <div className="bg-gradient-to-br from-pink-50 to-white border border-pink-100 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">Prestation</div><div className="font-serif text-2xl text-pink-600">{Math.floor(data.total_duration_min/60)}h{String(data.total_duration_min%60).padStart(2,'0')}</div></div>
        <div className="bg-gradient-to-br from-green-50 to-white border border-green-100 rounded-2xl p-4"><div className="text-[10px] uppercase tracking-widest text-slate-500">Trajet</div><div className="font-serif text-2xl text-green-700">{data.total_travel_min} min</div><div className="text-[10px] text-slate-500">{money2(data.total_km)} km</div></div>
      </div>

      {data.stops.length > 1 && (
        <button onClick={openFullTour} data-testid="open-full-tour" className="w-full bg-gold-gradient text-white rounded-full px-6 py-3 font-medium flex items-center justify-center gap-2"><Route className="w-4 h-4" /> Itinéraire complet</button>
      )}

      {data.stops.length === 0 ? (
        <div className="text-slate-400 text-sm py-10 text-center">Aucun rendez-vous ce jour.</div>
      ) : (
        <ol className="space-y-3">
          {data.stops.map((s, i) => {
            const gc = genderClasses(s.gender);
            return (
              <li key={s.id}>
                {i > 0 && (
                  <div className={`flex items-center gap-3 px-4 py-2 my-2 rounded-xl ${s.conflict ? "bg-red-50 border border-red-200" : "bg-slate-50"}`} data-testid={`travel-${i}`}>
                    {s.conflict ? <AlertTriangle className="w-4 h-4 text-[#991B1B]" /> : <Car className="w-4 h-4 text-slate-500" />}
                    <div className={`text-xs ${s.conflict ? "text-[#991B1B]" : "text-slate-600"}`}>
                      {s.travel_min !== null ? `Trajet ~${s.travel_min} min · ${s.travel_km} km` : "Adresse manquante"}
                      {s.conflict && " — Conflit probable"}
                    </div>
                  </div>
                )}
                <div className={`${gc.bg} border-2 ${gc.border} rounded-2xl p-4`} data-testid={`tour-stop-${i}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#0A192F] text-white flex items-center justify-center font-serif text-lg">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-3.5 h-3.5 text-[#1E3A8A]" />
                        <div className="font-medium">{fmtTime(s.date)}</div>
                        <span className="text-xs text-slate-500">· {s.duration_minutes} min</span>
                      </div>
                      <div className="font-serif text-lg">{genderLabel(s.gender) && <span className="text-slate-500 text-sm mr-1">{genderLabel(s.gender)}</span>}{s.client_name}</div>
                      {s.address && (
                        <div className="text-xs text-slate-500 flex items-start gap-1 mt-1"><MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" /> {s.address}</div>
                      )}
                      <div className="text-xs text-slate-500 mt-1 truncate">{s.services.map(x => x.name).join(", ")}</div>
                      <div className="flex items-center justify-between mt-3">
                        <div className="font-serif text-xl text-[#C5A059]">{money2(s.price_final)} €</div>
                        {s.address && (
                          <button onClick={() => openItinerary(s.address)} data-testid={`itinerary-${i}`} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-[#0A192F] text-white"><Navigation className="w-3 h-3" /> Itinéraire</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
