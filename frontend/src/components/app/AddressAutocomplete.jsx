import React, { useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";

const fb = "w-full bg-transparent border-b border-slate-300 rounded-none px-0 py-2 focus:border-[#0A192F] focus:outline-none text-base";
const lbl = "text-[10px] tracking-widest uppercase text-slate-500";

export const composeAddress = (p) => {
  if (!p) return "";
  const line1 = [p.number, p.street].filter(Boolean).join(" ").trim();
  const line2 = [p.postcode, p.city].filter(Boolean).join(" ").trim();
  const parts = [line1, line2].filter(Boolean);
  if (parts.length === 0) return "";
  return parts.join(", ") + ", France";
};

export const emptyParts = { number: "", street: "", postcode: "", city: "" };

export const AddressAutocomplete = ({ value, onChange }) => {
  const parts = value || emptyParts;
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [cities, setCities] = useState([]);
  const timer = useRef(null);

  const search = (q) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 3) { setSuggestions([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5&autocomplete=1`);
        const d = await r.json();
        setSuggestions(d.features || []);
      } catch { setSuggestions([]); }
    }, 350);
  };

  const pick = (f) => {
    const p = f.properties;
    const newParts = {
      number: p.housenumber || "",
      street: p.street || (p.type === "street" ? p.name : "") || p.name || "",
      postcode: p.postcode || "",
      city: p.city || "",
    };
    setQuery("");
    setSuggestions([]);
    onChange(newParts, { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] });
  };

  const setPart = (k, v) => onChange({ ...parts, [k]: v }, null);

  useEffect(() => {
    if (!/^\d{5}$/.test(parts.postcode || "")) { setCities([]); return; }
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${parts.postcode}&fields=nom`);
        const d = await r.json();
        if (!alive) return;
        const names = (d || []).map((x) => x.nom);
        setCities(names);
        if (names.length === 1 && parts.city !== names[0]) onChange({ ...parts, city: names[0] }, null);
      } catch { if (alive) setCities([]); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line
  }, [parts.postcode]);

  return (
    <div className="space-y-4" data-testid="address-autocomplete">
      <div className="relative">
        <label className={lbl}>Rechercher une adresse</label>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-0 top-3.5 text-slate-400" />
          <input
            data-testid="address-search-input"
            className={fb + " pl-6"}
            placeholder="Ex : 12 rue de la Paix Angers…"
            value={query}
            onChange={(e) => search(e.target.value)}
            autoComplete="off"
          />
        </div>
        {suggestions.length > 0 && (
          <ul className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden" data-testid="address-suggestions">
            {suggestions.map((f) => (
              <li key={f.properties.id}>
                <button
                  type="button"
                  data-testid={`address-suggestion-${f.properties.id}`}
                  onClick={() => pick(f)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex items-center gap-2"
                >
                  <MapPin className="w-3.5 h-3.5 text-[#D4AF37] flex-shrink-0" />
                  <span className="truncate">{f.properties.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-1">
          <label className={lbl}>N°</label>
          <input data-testid="address-number" className={fb} value={parts.number || ""} onChange={(e) => setPart("number", e.target.value)} />
        </div>
        <div className="col-span-3">
          <label className={lbl}>Rue</label>
          <input data-testid="address-street" className={fb} value={parts.street || ""} onChange={(e) => setPart("street", e.target.value)} />
        </div>
        <div className="col-span-1">
          <label className={lbl}>Code postal</label>
          <input data-testid="address-postcode" className={fb} inputMode="numeric" maxLength={5} value={parts.postcode || ""} onChange={(e) => setPart("postcode", e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="col-span-2">
          <label className={lbl}>Ville</label>
          {cities.length > 1 ? (
            <select data-testid="address-city-select" className={fb} value={parts.city || ""} onChange={(e) => setPart("city", e.target.value)}>
              <option value="">— Choisir la ville —</option>
              {cities.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (
            <input data-testid="address-city" className={fb} value={parts.city || ""} onChange={(e) => setPart("city", e.target.value)} />
          )}
          {cities.length > 1 && <div className="text-[10px] text-[#8A6A1F] mt-1">{cities.length} villes pour ce code postal</div>}
        </div>
        <div className="col-span-1">
          <label className={lbl}>Pays</label>
          <input data-testid="address-country" className={fb + " text-slate-400"} value="France" disabled readOnly />
        </div>
      </div>
    </div>
  );
};
