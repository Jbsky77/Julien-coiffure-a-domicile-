import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, genderClasses, genderLabel, computeAge } from "@/lib/api";
import { Plus, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { AddressAutocomplete, composeAddress, emptyParts } from "@/components/app/AddressAutocomplete";

// Parse CSV: header row with first_name,last_name,phone,address,birthday,comment
function parseCSV(txt) {
  const lines = txt.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => {
    const cells = l.split(",").map((c) => c.trim());
    const o = {};
    headers.forEach((h, i) => { o[h] = cells[i] || ""; });
    return o;
  });
}

// Parse vCard
function parseVCF(txt) {
  const cards = txt.split(/BEGIN:VCARD/i).slice(1);
  return cards.map((raw) => {
    const lines = raw.split(/\r?\n/);
    const out = { first_name: "", last_name: "", phone: "", address: "", birthday: "", comment: "" };
    for (const line of lines) {
      if (line.startsWith("FN:")) {
        const full = line.slice(3).trim();
        if (!out.first_name && !out.last_name) {
          const parts = full.split(" ");
          out.first_name = parts.slice(0, -1).join(" ");
          out.last_name = parts.slice(-1)[0] || full;
        }
      } else if (line.startsWith("N:")) {
        const [ln, fn] = line.slice(2).split(";");
        out.last_name = (ln || "").trim();
        out.first_name = (fn || "").trim();
      } else if (line.includes("TEL")) {
        const v = line.split(":").slice(1).join(":").trim();
        if (v) out.phone = v;
      } else if (line.startsWith("BDAY:") || line.startsWith("BDAY;")) {
        const v = line.split(":").slice(1).join(":").trim();
        if (/^\d{8}$/.test(v)) out.birthday = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`;
        else if (/^\d{4}-\d{2}-\d{2}/.test(v)) out.birthday = v.slice(0, 10);
      } else if (line.includes("ADR")) {
        const v = line.split(":").slice(1).join(":").trim().replace(/;+/g, " ").trim();
        if (v) out.address = v;
      }
    }
    return out;
  }).filter((x) => x.last_name || x.first_name);
}

export default function Clients() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", address: "", comment: "", birthday: "" });
  const [addressParts, setAddressParts] = useState(emptyParts);
  const [addressCoords, setAddressCoords] = useState(null);
  const fileRef = useRef(null);

  const load = async () => {
    const r = await api.get("/clients");
    setList(r.data);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.last_name) return toast.error("Nom obligatoire");
    const payload = {
      ...form,
      address: composeAddress(addressParts),
      address_parts: addressParts,
      ...(addressCoords || {}),
    };
    await api.post("/clients", payload);
    toast.success("Client créé");
    setShowAdd(false);
    setForm({ first_name: "", last_name: "", gender: "", phone: "", address: "", comment: "", birthday: "" });
    setAddressParts(emptyParts);
    setAddressCoords(null);
    load();
  };

  const onImportFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const txt = await f.text();
    const items = f.name.toLowerCase().endsWith(".vcf") ? parseVCF(txt) : parseCSV(txt);
    if (items.length === 0) { toast.error("Aucun contact détecté"); return; }
    const r = await api.post("/clients/import", { clients: items });
    toast.success(`${r.data.created} client(s) importé(s)`);
    e.target.value = "";
    load();
  };

  const filtered = list.filter((c) => {
    const s = `${c.first_name} ${c.last_name} ${c.phone}`.toLowerCase();
    return s.includes(q.toLowerCase());
  });

  const fb = "w-full bg-transparent border-b border-slate-300 rounded-none px-0 py-2 focus:border-[#0A192F] focus:outline-none text-base";

  return (
    <div className="space-y-8" data-testid="clients-page">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Répertoire</div>
          <h1 className="font-serif text-4xl md:text-5xl tracking-tight">Clients</h1>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv,.vcf,text/csv,text/vcard" onChange={onImportFile} className="hidden" data-testid="import-file-input" />
          <button onClick={() => fileRef.current?.click()} data-testid="import-contacts-btn" className="rounded-full px-4 py-3 border border-slate-200 text-sm flex items-center gap-2 hover:bg-slate-50"><Upload className="w-4 h-4" /> Importer</button>
          <button onClick={() => setShowAdd((s) => !s)} data-testid="toggle-add-client" className="bg-[#0A192F] text-white rounded-full px-6 py-3 text-sm font-medium hover:bg-[#1E3A8A] flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nouveau
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6 shadow-premium">
          <div>
            <label className="text-[10px] tracking-widest uppercase text-slate-500">Civilité</label>
            <div className="flex gap-2 mt-2">
              {[{ v: "", l: "—" }, { v: "H", l: "M." }, { v: "F", l: "Mme" }].map((g) => (
                <button key={g.v} type="button" onClick={() => setForm({ ...form, gender: g.v })} data-testid={`new-gender-${g.v || "none"}`} className={`px-4 py-2 rounded-full text-sm ${form.gender === g.v ? (g.v === "H" ? "bg-blue-500 text-white" : g.v === "F" ? "bg-pink-500 text-white" : "bg-[#0A192F] text-white") : "border border-slate-200 text-slate-600"}`}>{g.l}</button>
              ))}
            </div>
          </div>
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">Anniversaire</label><input type="date" data-testid="new-birthday" className={fb} value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} /></div>
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">Prénom</label><input data-testid="new-first-name" className={fb} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">Nom *</label><input data-testid="new-last-name" className={fb} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">Téléphone</label><input data-testid="new-phone" className={fb} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="md:col-span-2">
            <AddressAutocomplete
              value={addressParts}
              onChange={(parts, coords) => { setAddressParts(parts); setAddressCoords(coords); }}
            />
          </div>
          <div className="md:col-span-2"><label className="text-[10px] tracking-widest uppercase text-slate-500">Commentaire</label><input data-testid="new-comment" className={fb} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></div>
          <div className="md:col-span-2"><button onClick={create} data-testid="create-client-btn" className="bg-[#0A192F] text-white rounded-full px-6 py-3 font-medium">Créer le client</button></div>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input data-testid="clients-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un client…" className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-full focus:outline-none focus:border-[#0A192F] bg-white" />
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {filtered.map((c) => {
          const gc = genderClasses(c.gender);
          const age = computeAge(c.birthday);
          return (
            <li key={c.id}>
              <Link to={`/clients/${c.id}`} data-testid={`client-item-${c.id}`} className={`flex items-center gap-4 p-4 rounded-2xl border ${gc.border} ${gc.bg} hover:shadow-premium transition-all`}>
                <div className={`w-11 h-11 rounded-full ${gc.accent} text-white flex items-center justify-center font-semibold`}>
                  {(c.first_name?.[0] || "") + (c.last_name?.[0] || "")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {genderLabel(c.gender) && <span className="text-slate-500 mr-1">{genderLabel(c.gender)}</span>}
                    {c.first_name} <span className="font-semibold">{c.last_name}</span>
                    {age !== null && <span className="text-xs text-slate-500 ml-2">{age} ans</span>}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{c.phone || "—"}</div>
                </div>
                {c.referrals >= 2 && <span className="text-[9px] tracking-widest uppercase px-2 py-0.5 rounded-full bg-[#D4AF37]/10 text-[#C5A059] border border-[#D4AF37]/30">Parrain ★</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
