import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

export default function Clients() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", address: "", comment: "", birthday: "" });

  const load = async () => {
    const r = await api.get("/clients");
    setList(r.data);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.last_name) return toast.error("Nom obligatoire");
    const r = await api.post("/clients", form);
    toast.success("Client créé");
    setShowAdd(false);
    setForm({ first_name: "", last_name: "", phone: "", address: "", comment: "", birthday: "" });
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
        <button onClick={() => setShowAdd((s) => !s)} data-testid="toggle-add-client" className="bg-[#0A192F] text-white rounded-full px-6 py-3 text-sm font-medium hover:bg-[#1E3A8A] flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nouveau
        </button>
      </div>

      {showAdd && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6 shadow-premium">
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">Prénom</label><input data-testid="new-first-name" className={fb} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">Nom *</label><input data-testid="new-last-name" className={fb} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">Téléphone</label><input data-testid="new-phone" className={fb} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="text-[10px] tracking-widest uppercase text-slate-500">Anniversaire</label><input type="date" data-testid="new-birthday" className={fb} value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="text-[10px] tracking-widest uppercase text-slate-500">Adresse</label><input data-testid="new-address" className={fb} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="text-[10px] tracking-widest uppercase text-slate-500">Commentaire</label><input data-testid="new-comment" className={fb} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></div>
          <div className="md:col-span-2"><button onClick={create} data-testid="create-client-btn" className="bg-[#0A192F] text-white rounded-full px-6 py-3 font-medium">Créer le client</button></div>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input data-testid="clients-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un client…" className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-full focus:outline-none focus:border-[#0A192F] bg-white" />
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {filtered.map((c) => (
          <li key={c.id}>
            <Link to={`/clients/${c.id}`} data-testid={`client-item-${c.id}`} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-white hover:shadow-premium transition-all">
              <div className="w-11 h-11 rounded-full bg-[#0A192F] text-white flex items-center justify-center font-semibold">
                {(c.first_name?.[0] || "") + (c.last_name?.[0] || "")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.first_name} <span className="font-semibold">{c.last_name}</span></div>
                <div className="text-xs text-slate-500 truncate">{c.phone || "—"}</div>
              </div>
              {c.referrals >= 2 && <span className="text-[9px] tracking-widest uppercase px-2 py-0.5 rounded-full bg-[#D4AF37]/10 text-[#C5A059] border border-[#D4AF37]/30">Parrain ★</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
