import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api, money, genderLabel } from "@/lib/api";
import { MapPin, Target, Users, TrendingUp, Loader2, Crosshair } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS = {
  actif:          { color: "#059669", label: "Actif" },
  a_relancer:     { color: "#D4AF37", label: "À relancer" },
  en_retard:      { color: "#EA580C", label: "En retard" },
  presque_perdu:  { color: "#DC2626", label: "Presque perdu" },
  perdu:          { color: "#7F1D1D", label: "Perdu" },
  inconnu:        { color: "#64748B", label: "Sans RDV" },
};

function ClickCapture({ enabled, onClick }) {
  useMapEvents({
    click: (e) => { if (enabled) onClick([e.latlng.lat, e.latlng.lng]); },
  });
  return null;
}

export default function MapPage() {
  const [clients, setClients] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [revenues, setRevenues] = useState({});
  const navigate = useNavigate();

  const [mode, setMode] = useState("clients"); // "clients" | "prospection"
  const [zoneCenter, setZoneCenter] = useState(null);
  const [radius, setRadius] = useState(5);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    (async () => {
      const [cli, st, rdv] = await Promise.all([
        api.get("/clients"),
        api.get("/clients/status").catch(() => ({ data: [] })),
        api.get("/appointments"),
      ]);
      setClients(cli.data || []);
      const map = {};
      (st.data || []).forEach((s) => { map[s.id] = s.status; });
      setStatuses(map);
      const rev = {};
      (rdv.data || []).filter((r) => r.status === "done").forEach((r) => {
        rev[r.client_id] = (rev[r.client_id] || 0) + r.price_final;
      });
      setRevenues(rev);
    })();
  }, []);

  const geocoded = useMemo(() => clients.filter((c) => c.lat && c.lng), [clients]);

  const center = useMemo(() => {
    if (geocoded.length === 0) return [46.6, 2.4];
    const sumLat = geocoded.reduce((a, c) => a + c.lat, 0);
    const sumLng = geocoded.reduce((a, c) => a + c.lng, 0);
    return [sumLat / geocoded.length, sumLng / geocoded.length];
  }, [geocoded]);

  const missing = clients.length - geocoded.length;
  const inZoneIds = useMemo(() => new Set(analysis?.client_ids_in_zone || []), [analysis]);

  const analyze = async () => {
    if (!zoneCenter) return toast.error("Touchez la carte pour placer le centre de la zone");
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const r = await api.post("/prospection/analyze", {
        lat: zoneCenter[0],
        lng: zoneCenter[1],
        radius_km: radius,
      });
      setAnalysis(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Analyse impossible");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="map-page">
      <div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Territoire</div>
        <h1 className="font-serif text-4xl md:text-5xl tracking-tight">Carte des clients</h1>
        <div className="mt-3 text-sm text-slate-500 flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {geocoded.length} clients localisés</span>
          {missing > 0 && <span className="text-orange-600">· {missing} sans adresse géocodable</span>}
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 bg-white rounded-full p-1 shadow-sm border border-slate-100 max-w-md">
        {[
          { id: "clients", label: "Clients", icon: Users },
          { id: "prospection", label: "Zone de prospection", icon: Target },
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            data-testid={`map-mode-${m.id}`}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition ${
              mode === m.id ? "bg-[#0A192F] text-white" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <m.icon className="w-3.5 h-3.5" /> {m.label}
          </button>
        ))}
      </div>

      {mode === "clients" ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(STATUS_COLORS).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-200 bg-white">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: v.color }} />
              {v.label}
            </span>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-[#D4AF37]/30 rounded-2xl p-4 space-y-3" data-testid="prospection-controls">
          <div className="text-sm text-slate-600 flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-[#D4AF37] flex-shrink-0" />
            {zoneCenter ? "Centre placé — ajustez le rayon puis analysez." : "Touchez la carte pour placer le centre de votre zone."}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs text-slate-500 whitespace-nowrap">Rayon : <span className="font-semibold text-[#0A192F]">{radius} km</span></label>
            <input
              type="range" min="1" max="20" step="1" value={radius}
              onChange={(e) => setRadius(parseInt(e.target.value))}
              data-testid="prospection-radius"
              className="flex-1 min-w-[120px] accent-[#D4AF37]"
            />
            <button
              onClick={analyze}
              disabled={analyzing || !zoneCenter}
              data-testid="prospection-analyze-btn"
              className="bg-[#0A192F] text-white rounded-full px-5 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-40 hover:bg-[#1E3A8A]"
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              {analyzing ? "Analyse…" : "Analyser la zone"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden shadow-premium border border-slate-100" style={{ height: mode === "prospection" ? "50vh" : "70vh" }} data-testid="map-container">
        <MapContainer
          center={center}
          zoom={geocoded.length ? 10 : 6}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickCapture enabled={mode === "prospection"} onClick={(pos) => { setZoneCenter(pos); setAnalysis(null); }} />

          {mode === "prospection" && zoneCenter && (
            <>
              <Circle
                center={zoneCenter}
                radius={radius * 1000}
                pathOptions={{ color: "#D4AF37", weight: 2, fillColor: "#D4AF37", fillOpacity: 0.08, dashArray: "6 6" }}
              />
              <CircleMarker center={zoneCenter} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#0A192F", fillOpacity: 1 }} />
            </>
          )}

          {mode === "prospection" && (analysis?.suggestions || []).map((s) => (
            <CircleMarker
              key={s.code}
              center={[s.lat, s.lng]}
              radius={14}
              pathOptions={{ color: "#D4AF37", weight: 3, fillColor: "#D4AF37", fillOpacity: 0.35 }}
            >
              <Popup>
                <div className="min-w-[160px]">
                  <div className="font-medium text-sm">{s.nom}</div>
                  <div className="text-xs text-slate-500 mt-1">{s.population.toLocaleString("fr-FR")} hab. · {s.clients} client{s.clients > 1 ? "s" : ""} · à {s.distance_km} km</div>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {geocoded.map((c) => {
            const status = statuses[c.id] || "inconnu";
            const conf = STATUS_COLORS[status] || STATUS_COLORS.inconnu;
            const rev = revenues[c.id] || 0;
            const highlighted = mode === "prospection" && analysis && inZoneIds.has(c.id);
            return (
              <CircleMarker
                key={c.id}
                center={[c.lat, c.lng]}
                radius={highlighted ? 10 : 9}
                pathOptions={{
                  color: highlighted ? "#D4AF37" : "#fff",
                  weight: highlighted ? 3 : 2,
                  fillColor: conf.color,
                  fillOpacity: mode === "prospection" && analysis && !highlighted ? 0.35 : 0.9,
                }}
              >
                <Popup>
                  <div className="min-w-[180px]" data-testid={`map-popup-${c.id}`}>
                    <div className="font-medium text-sm">
                      {genderLabel(c.gender) && <span className="text-slate-400 mr-1">{genderLabel(c.gender)}</span>}
                      {c.first_name} {c.last_name}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: conf.color }} />
                        {conf.label}
                      </span>
                      <span className="ml-2">· CA {money(rev)}</span>
                    </div>
                    {c.address && <div className="text-[11px] text-slate-500 mt-1">{c.address}</div>}
                    <button
                      onClick={() => navigate(`/clients/${c.id}`)}
                      className="mt-2 text-xs bg-[#0A192F] text-white rounded-full px-3 py-1"
                      data-testid={`map-open-${c.id}`}
                    >
                      Ouvrir la fiche
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {mode === "prospection" && analysis && (
        <div className="space-y-4" data-testid="prospection-results">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-slate-100 rounded-2xl p-4" data-testid="prospection-kpi-clients">
              <div className="text-[10px] tracking-widest uppercase text-slate-500">Clients dans la zone</div>
              <div className="font-serif text-3xl text-[#0A192F] mt-1">{analysis.clients_in_zone}</div>
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl p-4" data-testid="prospection-kpi-population">
              <div className="text-[10px] tracking-widest uppercase text-slate-500">Population estimée</div>
              <div className="font-serif text-3xl text-[#0A192F] mt-1">{(analysis.population_estimate || 0).toLocaleString("fr-FR")}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">autour de {analysis.center.commune}</div>
            </div>
            <div className="bg-white border border-[#D4AF37]/30 rounded-2xl p-4" data-testid="prospection-kpi-penetration">
              <div className="text-[10px] tracking-widest uppercase text-slate-500">Taux de pénétration</div>
              <div className="font-serif text-3xl text-[#C5A059] mt-1">{analysis.penetration_per_1000 !== null ? analysis.penetration_per_1000.toLocaleString("fr-FR") : "—"}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">clients / 1 000 habitants</div>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-premium">
            <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-3 flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-[#D4AF37]" /> Où prospecter en priorité</div>
            {analysis.suggestions.length === 0 ? (
              <div className="text-sm text-slate-500">Aucune commune candidate trouvée dans ce périmètre.</div>
            ) : (
              <ol className="space-y-3">
                {analysis.suggestions.map((s, i) => (
                  <li key={s.code} className="flex items-center gap-4 p-3 rounded-xl bg-slate-50" data-testid={`prospection-suggestion-${i}`}>
                    <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#C5A059] text-white flex items-center justify-center font-serif flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{s.nom}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {s.population.toLocaleString("fr-FR")} habitants · {s.clients === 0 ? "aucun client actuel" : `${s.clients} client${s.clients > 1 ? "s" : ""} actuel${s.clients > 1 ? "s" : ""}`} · à {s.distance_km} km du centre
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[10px] tracking-widest uppercase text-slate-400">Potentiel</div>
                      <div className="font-serif text-lg text-[#0A192F]">{Math.round(s.population / (s.clients + 1)).toLocaleString("fr-FR")}</div>
                      <div className="text-[9px] text-slate-400">hab. / client</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <div className="text-[10px] text-slate-400 mt-4">Estimation basée sur les données open-data des communes françaises (geo.api.gouv.fr) — approximative mais utile pour cibler votre prospection.</div>
          </div>
        </div>
      )}
    </div>
  );
}
