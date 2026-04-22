import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2, Pencil, Save, X, Bell } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_TAGS = ["Shampoing", "Couleur", "Soin", "Coupe", "Autre"];

export default function Stock() {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState("Tous");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", quantity: 0, threshold: 0, tag: "Autre" });
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({});

  const load = async () => {
    const r = await api.get("/stock");
    setList(r.data);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name) return toast.error("Nom requis");
    await api.post("/stock", form);
    toast.success("Produit ajouté");
    setForm({ name: "", quantity: 0, threshold: 0, tag: "Autre" });
    setShowAdd(false);
    load();
  };

  const save = async () => {
    await api.put(`/stock/${editingId}`, edit);
    setEditingId(null);
    toast.success("Enregistré");
    load();
  };

  const remove = async (id) => {
    if (!window.confirm("Supprimer ?")) return;
    await api.delete(`/stock/${id}`);
    load();
  };

  const tags = ["Tous", ...DEFAULT_TAGS];
  const filtered = useMemo(() => filter === "Tous" ? list : list.filter((s) => s.tag === filter), [list, filter]);
  const fb = "w-full bg-transparent border-b border-slate-300 rounded-none px-0 py-2 focus:border-[#0A192F] focus:outline-none text-base";

  return (
    <div className="space-y-8" data-testid="stock-page">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Inventaire</div>
          <h1 className="font-serif text-4xl md:text-5xl tracking-tight">Gestion du stock</h1>
        </div>
        <button onClick={() => setShowAdd((s) => !s)} data-testid="toggle-add-stock" className="bg-[#0A192F] text-white rounded-full px-6 py-3 text-sm font-medium hover:bg-[#1E3A8A] flex items-center gap-2">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {showAdd && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-4 gap-6 shadow-premium">
          <div className="md:col-span-2"><label className="text-[10px] uppercase tracking-widest text-slate-500">Nom</label><input data-testid="stock-name" className={fb} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Quantité</label><input data-testid="stock-qty" type="number" className={fb} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Seuil alerte</label><input data-testid="stock-threshold" type="number" className={fb} value={form.threshold} onChange={(e) => setForm({ ...form, threshold: parseFloat(e.target.value) || 0 })} /></div>
          <div className="md:col-span-3"><label className="text-[10px] uppercase tracking-widest text-slate-500">Catégorie</label>
            <select className={fb} value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} data-testid="stock-tag">
              {DEFAULT_TAGS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="md:col-span-1 flex items-end"><button onClick={create} data-testid="stock-create-btn" className="bg-[#0A192F] text-white rounded-full px-6 py-3 w-full">Créer</button></div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {tags.map((t) => (
          <button key={t} onClick={() => setFilter(t)} data-testid={`stock-filter-${t}`} className={`px-4 py-2 rounded-full text-sm ${filter === t ? "bg-[#0A192F] text-white" : "border border-slate-200 text-slate-600"}`}>{t}</button>
        ))}
      </div>

      {filtered.length === 0 ? <div className="text-slate-400 text-sm py-10 text-center">Aucun produit.</div> : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((s) => {
            const low = s.quantity <= s.threshold;
            const isEdit = editingId === s.id;
            return (
              <li key={s.id} className={`bg-white border rounded-2xl p-5 ${low ? "border-red-200" : "border-slate-100"}`} data-testid={`stock-item-${s.id}`}>
                {isEdit ? (
                  <div className="grid grid-cols-4 gap-3 items-end">
                    <div className="col-span-2"><label className="text-[10px] uppercase tracking-widest text-slate-500">Nom</label><input className={fb} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                    <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Qté</label><input type="number" className={fb} value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: parseFloat(e.target.value) || 0 })} /></div>
                    <div><label className="text-[10px] uppercase tracking-widest text-slate-500">Seuil</label><input type="number" className={fb} value={edit.threshold} onChange={(e) => setEdit({ ...edit, threshold: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="col-span-2"><label className="text-[10px] uppercase tracking-widest text-slate-500">Catégorie</label>
                      <select className={fb} value={edit.tag} onChange={(e) => setEdit({ ...edit, tag: e.target.value })}>
                        {DEFAULT_TAGS.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 flex gap-2 justify-end">
                      <button onClick={() => setEditingId(null)} className="rounded-full border border-slate-200 px-3 py-2"><X className="w-4 h-4" /></button>
                      <button onClick={save} className="bg-[#0A192F] text-white rounded-full px-4 py-2 flex items-center gap-2"><Save className="w-4 h-4" /> Enregistrer</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-medium truncate">{s.name}</div>
                        <span className="text-[9px] tracking-widest uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{s.tag}</span>
                        {low && <span className="text-[9px] tracking-widest uppercase px-2 py-0.5 rounded-full bg-red-50 text-[#991B1B] border border-red-100 flex items-center gap-1"><Bell className="w-3 h-3" /> Stock bas</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{s.quantity} en stock · seuil {s.threshold}</div>
                    </div>
                    <button onClick={() => { setEditingId(s.id); setEdit(s); }} data-testid={`edit-stock-${s.id}`} className="rounded-full p-2 hover:bg-slate-50"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => remove(s.id)} data-testid={`delete-stock-${s.id}`} className="rounded-full p-2 text-[#991B1B] hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
