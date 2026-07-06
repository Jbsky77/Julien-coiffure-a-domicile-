import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { api, money, genderLabel } from "@/lib/api";
import { MapPin } from "lucide-react";

const STATUS_COLORS = {
  actif:          { color: "#059669", label: "Actif" },
  a_relancer:     { color: "#D4AF37", label: "À relancer" },
  en_retard:      { color: "#EA580C", label: "En retard" },
  presque_perdu:  { color: "#DC2626", label: "Presque perdu" },
  perdu:          { color: "#7F1D1D", label: "Perdu" },
  inconnu:        { color: "#64748B", label: "Sans RDV" },
};

export default function MapPage() {
  const [clients, setClients] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [revenues, setRevenues] = useState({});
  const navigate = useNavigate();

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
    if (geocoded.length === 0) return [46.6, 2.4]; // Center of France fallback
    const sumLat = geocoded.reduce((a, c) => a + c.lat, 0);
    const sumLng = geocoded.reduce((a, c) => a + c.lng, 0);
    return [sumLat / geocoded.length, sumLng / geocoded.length];
  }, [geocoded]);

  const missing = clients.length - geocoded.length;

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

      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(STATUS_COLORS).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-200 bg-white">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: v.color }} />
            {v.label}
          </span>
        ))}
      </div>

      <div className="rounded-2xl overflow-hidden shadow-premium border border-slate-100" style={{ height: "70vh" }} data-testid="map-container">
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
          {geocoded.map((c) => {
            const status = statuses[c.id] || "inconnu";
            const conf = STATUS_COLORS[status] || STATUS_COLORS.inconnu;
            const rev = revenues[c.id] || 0;
            return (
              <CircleMarker
                key={c.id}
                center={[c.lat, c.lng]}
                radius={9}
                pathOptions={{ color: "#fff", weight: 2, fillColor: conf.color, fillOpacity: 0.9 }}
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
    </div>
  );
}
