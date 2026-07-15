import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, ChevronDown, ChevronRight, History, PackagePlus, Pencil, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { catalogSearchMatches, normalizeStockText as clean, recommendedOrderQuantity, stockQuantity as q, visibleStockValue } from "@/lib/stockDomain";
import { toast } from "sonner";

const euro = (value) => Number(value).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const label = (product) => [product?.productName, product?.shadeCode, product?.shadeName, product?.format].filter(Boolean).join(" · ");

function statusFor(item) {
  const quantity = q(item.quantity);
  const threshold = q(item.reorder_threshold ?? item.threshold ?? 0);
  if (quantity < 0) return { label: "Stock négatif — à commander", cls: "bg-red-50 border-red-200 text-red-800" };
  if (quantity === 0) return { label: "Rupture — à commander", cls: "bg-red-50 border-red-200 text-red-800" };
  if (quantity <= threshold) return { label: "Stock faible — à commander", cls: "bg-amber-50 border-amber-200 text-amber-900" };
  return { label: "Disponible", cls: "bg-emerald-50 border-emerald-200 text-emerald-800" };
}

function AddProductDialog({ catalog, stockItems, onClose, onAdded }) {
  const [form, setForm] = useState({ brand: "", category: "", range: "", productId: "", quantity: 1, unitPrice: "", search: "" });
  const [saving, setSaving] = useState(false);
  const brands = [...new Set(catalog.map((p) => p.brand))];
  const categories = [...new Set(catalog.filter((p) => !form.brand || p.brand === form.brand).map((p) => p.normalizedCategory))];
  const ranges = [...new Set(catalog.filter((p) => (!form.brand || p.brand === form.brand) && (!form.category || p.normalizedCategory === form.category)).map((p) => p.range))];
  const term = clean(form.search);
  const products = catalog.filter((p) => {
    if (form.brand && p.brand !== form.brand) return false;
    if (form.category && p.normalizedCategory !== form.category) return false;
    if (form.range && p.range !== form.range) return false;
    return catalogSearchMatches(p, term);
  });
  const selected = catalog.find((p) => p.id === form.productId);
  const existingItem = stockItems.find((item) => item.catalog_product_id === form.productId);

  const submit = async () => {
    if (!selected) return toast.error("Sélectionnez un produit");
    if (!Number.isInteger(Number(form.quantity)) || Number(form.quantity) <= 0) return toast.error("La quantité doit être un entier supérieur à zéro");
    if (form.unitPrice !== "" && (Number(form.unitPrice) < 0 || !/^\d+(?:[.,]\d{1,2})?$/.test(String(form.unitPrice)))) return toast.error("Le tarif doit être positif avec deux décimales maximum");
    setSaving(true);
    try {
      const response = await api.post("/stock/catalog-add", { catalog_product_id: selected.id, quantity: Number(form.quantity), unit_price: form.unitPrice === "" ? null : Number(String(form.unitPrice).replace(",", ".")) });
      const productName = label(selected) || selected.productName;
      toast.success(existingItem
        ? productName + " : stock porté à " + q(response.data.quantity).toLocaleString("fr-FR")
        : productName + " ajouté au stock");
      await onAdded(); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Impossible d'ajouter le produit"); }
    finally { setSaving(false); }
  };

  const selectClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3";
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="add-stock-title">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-y-auto p-5 md:p-7 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Catalogue professionnel</div><h2 id="add-stock-title" className="font-serif text-3xl">Ajouter un produit au stock</h2></div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="text-xs text-slate-600">Marque *
            <select value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value, category: "", range: "", productId: "" })} className={selectClass}><option value="">Sélectionner…</option>{brands.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <label className="text-xs text-slate-600">Catégorie *
            <select disabled={!form.brand} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, range: "", productId: "" })} className={selectClass}><option value="">Sélectionner…</option>{categories.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <label className="text-xs text-slate-600">Gamme *
            <select disabled={!form.category} value={form.range} onChange={(e) => setForm({ ...form, range: e.target.value, productId: "" })} className={selectClass}><option value="">Sélectionner…</option>{ranges.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
        </div>
        <label className="text-xs text-slate-600 block">Recherche produit
          <div className="relative mt-1"><Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" /><input value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value, productId: "" })} placeholder="Nom, gamme, code nuance, format ou EAN" className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-3" /></div>
        </label>
        <label className="text-xs text-slate-600 block">Produit *
          <select disabled={!form.range && !form.search} value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className={selectClass} size={Math.min(6, Math.max(1, products.length))} data-testid="catalog-product-select">
            <option value="" disabled>Choisissez la référence exacte…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.range} — {label(p)}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-xs text-slate-600">Quantité ajoutée *
            <input type="number" min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={selectClass} />
          </label>
          <label className="text-xs text-slate-600">Tarif unitaire (facultatif)
            <div className="relative"><input inputMode="decimal" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} placeholder="Non renseigné" className={`${selectClass} pr-9`} /><span className="absolute right-3 top-4 text-slate-500">€</span></div>
          </label>
        </div>
        {selected && <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-sm"><strong>Résumé :</strong> {selected.brand} · {selected.normalizedCategory} · {selected.range} · {label(selected)} · quantité {form.quantity}{form.unitPrice !== "" ? ` · ${form.unitPrice} € l'unité (remplace le tarif actuel)` : " · tarif actuel conservé"}</div>}
        {existingItem && <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-950"><strong>Déjà présent :</strong> cet ajout augmentera la quantité de la ligne existante, sans créer de doublon.</div>}
        <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2"><button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-5 py-3">Annuler</button><button type="button" disabled={saving || !selected} onClick={submit} className="rounded-full bg-[#0A192F] text-white px-6 py-3 disabled:opacity-50">{saving ? "Ajout…" : "Ajouter au stock"}</button></div>
      </div>
    </div>
  );
}

function StockLine({ item, showPrices, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState("add");
  const [amount, setAmount] = useState(1);
  const [price, setPrice] = useState(item.unit_price ?? "");
  const [movements, setMovements] = useState(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(item.name || "");
  const [tag, setTag] = useState(item.tag || "Autre");
  const [thresholdEdit, setThresholdEdit] = useState(item.reorder_threshold ?? item.threshold ?? 0);
  const [targetEdit, setTargetEdit] = useState(item.target_stock ?? 1);
  const product = item.catalog_product || item.product_snapshot || {};
  const unit = product.stockUnit || "unité";
  const status = statusFor(item);
  const threshold = q(item.reorder_threshold ?? item.threshold ?? 0);
  const recommended = recommendedOrderQuantity(item.quantity, item.target_stock ?? 1);

  const save = async () => {
    setSaving(true);
    try {
      const payload = mode === "price" ? { mode, unit_price: price === "" ? null : Number(price), remove_price: price === "", reorder_threshold: Number(thresholdEdit), target_stock: Number(targetEdit) } : { mode, quantity: Number(amount), note: "Modification depuis l'écran Stock", reorder_threshold: Number(thresholdEdit), target_stock: Number(targetEdit) };
      await api.post(`/stock/${item.id}/adjust`, payload);
      if (!item.catalog_product_id && (name !== item.name || tag !== item.tag)) await api.put(`/stock/${item.id}`, { name, tag });
      toast.success("Stock mis à jour"); setEditing(false); await onChanged();
    } catch (e) { toast.error(e.response?.data?.detail || "Modification impossible"); }
    finally { setSaving(false); }
  };
  const loadMovements = async () => {
    if (movements) return setMovements(null);
    try { setMovements((await api.get(`/stock/${item.id}/movements`)).data); } catch { toast.error("Historique indisponible"); }
  };
  const remove = async () => {
    if (!window.confirm(`Retirer définitivement « ${item.name} » du stock ? L'historique des mouvements sera conservé.`)) return;
    await api.delete(`/stock/${item.id}`); toast.success("Produit retiré"); onChanged();
  };
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`stock-item-${item.id}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium">{product.productName || item.name} {product.shadeCode || ""}</div>
          <div className="text-xs text-slate-500">{[product.shadeName, product.format].filter(Boolean).join(" · ") || item.tag}</div>
          <div className="mt-2 flex flex-wrap gap-2 items-center"><strong>{q(item.quantity).toLocaleString("fr-FR", { maximumFractionDigits: 4 })} {unit}{Math.abs(q(item.quantity)) > 1 ? "s" : ""}</strong><span className={`text-[10px] border rounded-full px-2 py-1 ${status.cls}`}>{status.label}</span></div>
          {q(item.quantity) <= threshold && <div className="text-xs text-red-700 mt-1"><Bell className="inline w-3 h-3 mr-1" />Quantité recommandée : commander {recommended.toLocaleString("fr-FR")} {unit}{recommended > 1 ? "s" : ""}</div>}
          {showPrices && <div className="text-xs text-slate-600 mt-2">Tarif : {item.unit_price === null || item.unit_price === undefined ? "Non renseigné" : euro(item.unit_price)} · Valeur : {item.unit_price === null || item.unit_price === undefined ? "Non renseignée" : euro(q(item.quantity) * item.unit_price)}</div>}
        </div>
        <button type="button" onClick={() => setEditing(!editing)} aria-label="Modifier" className="p-2 rounded-full hover:bg-slate-50"><Pencil className="w-4 h-4" /></button>
        <button type="button" onClick={remove} aria-label="Retirer du stock" className="p-2 rounded-full text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
      </div>
      {editing && <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
        {!item.catalog_product_id && <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><label className="text-xs">Nom<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="text-xs">Catégorie<input value={tag} onChange={(e) => setTag(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label></div>}
        <div className="flex flex-wrap gap-2">{[{ v: "add", l: "Ajouter" }, { v: "remove", l: "Retirer" }, { v: "set", l: "Inventaire" }, { v: "price", l: "Tarif" }].map((x) => <button key={x.v} onClick={() => setMode(x.v)} className={`rounded-full px-3 py-2 text-xs ${mode === x.v ? "bg-[#0A192F] text-white" : "border border-slate-200"}`}>{x.l}</button>)}</div>
        {mode === "price" ? <label className="text-xs block">Tarif unitaire (vide pour supprimer)<input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label> : <label className="text-xs block">Quantité<input type="number" min="0" step="0.25" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label>}
        <div className="grid grid-cols-2 gap-3"><label className="text-xs">Seuil de commande<input type="number" step="0.25" value={thresholdEdit} onChange={(e) => setThresholdEdit(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="text-xs">Stock cible<input type="number" min="0" step="0.25" value={targetEdit} onChange={(e) => setTargetEdit(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label></div>
        <button disabled={saving} onClick={save} className="rounded-full bg-[#0A192F] text-white px-4 py-2 text-sm disabled:opacity-50">{saving ? "Enregistrement…" : "Valider"}</button>
      </div>}
      <button type="button" onClick={loadMovements} className="mt-3 text-xs text-slate-500 flex items-center gap-1"><History className="w-3.5 h-3.5" /> {movements ? "Masquer les mouvements" : "Voir les mouvements"}</button>
      {movements && <div className="mt-2 space-y-1.5">{movements.length === 0 ? <div className="text-xs text-slate-400">Aucun mouvement.</div> : movements.map((m) => <div key={m.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs flex justify-between gap-2"><span>{new Date(m.created_at).toLocaleString("fr-FR")} · {m.reason || m.movement_type}</span><strong>{m.quantity_delta > 0 ? "+" : ""}{q(m.quantity_delta).toLocaleString("fr-FR")}</strong></div>)}</div>}
    </article>
  );
}

export default function Stock() {
  const [list, setList] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [orderOnly, setOrderOnly] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showLegacyAdd, setShowLegacyAdd] = useState(false);
  const [legacyForm, setLegacyForm] = useState({ name: "", quantity: 1, threshold: 0, tag: "Autre" });
  const [showPrices, setShowPrices] = useState(() => localStorage.getItem("showStockPrices") !== "false");
  const [collapsed, setCollapsed] = useState({});
  const load = useCallback(async () => {
    try { const [s, c] = await Promise.all([api.get("/stock"), api.get("/stock/catalog")]); setList(s.data); setCatalog(c.data.products || []); }
    catch { toast.error("Impossible de charger le stock"); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { localStorage.setItem("showStockPrices", String(showPrices)); }, [showPrices]);

  const brands = [...new Set(catalog.map((p) => p.brand))];
  const categories = [...new Set(catalog.filter((p) => !brand || p.brand === brand).map((p) => p.normalizedCategory))];
  const filtered = useMemo(() => {
    const term = clean(search);
    return list.filter((item) => {
      const p = item.catalog_product || item.product_snapshot || {};
      if (brand && p.brand !== brand) return false;
      if (category && p.normalizedCategory !== category) return false;
      if (orderOnly && q(item.quantity) > q(item.reorder_threshold ?? item.threshold ?? 0)) return false;
      return !term || clean([item.name, item.tag, p.brand, p.normalizedCategory, p.range, p.productName, p.shadeCode, p.normalizedShadeCode, p.shadeName, p.format, p.ean].join(" ")).includes(term);
    });
  }, [list, search, brand, category, orderOnly]);
  const grouped = useMemo(() => {
    const groups = {};
    for (const item of filtered) {
      const p = item.catalog_product || item.product_snapshot || {};
      const b = p.brand || "Produits existants";
      const c = p.normalizedCategory || item.tag || "Autre";
      groups[b] ||= {}; groups[b][c] ||= []; groups[b][c].push(item);
    }
    Object.values(groups).forEach((categories) => {
      Object.values(categories).forEach((items) => items.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))));
    });
    return groups;
  }, [filtered]);
  const total = visibleStockValue(filtered);
  const reset = useCallback(() => { setSearch(""); setBrand(""); setCategory(""); setOrderOnly(false); }, []);
  const handleProductAdded = useCallback(async () => {
    reset();
    setCollapsed({});
    await load();
  }, [load, reset]);
  const addLegacy = async () => {
    if (!legacyForm.name.trim()) return toast.error("Le nom est obligatoire");
    try { await api.post("/stock", { ...legacyForm, name: legacyForm.name.trim(), quantity: Number(legacyForm.quantity), threshold: Number(legacyForm.threshold) }); toast.success("Produit libre ajouté"); setLegacyForm({ name: "", quantity: 1, threshold: 0, tag: "Autre" }); setShowLegacyAdd(false); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Ajout impossible"); }
  };

  return (
    <div className="space-y-7" data-testid="stock-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4"><div><div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 mb-2">Inventaire professionnel</div><h1 className="font-serif text-4xl md:text-5xl tracking-tight">Gestion du stock</h1></div><div className="flex flex-col sm:flex-row gap-2"><button onClick={() => setShowLegacyAdd(!showLegacyAdd)} className="border border-slate-200 rounded-full px-5 py-3">Produit libre</button><button onClick={() => setShowAdd(true)} className="bg-[#0A192F] text-white rounded-full px-6 py-3 flex items-center justify-center gap-2"><PackagePlus className="w-4 h-4" /> Ajouter un produit au stock</button></div></div>
      {showLegacyAdd && <div className="bg-white border border-slate-100 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-5 gap-4 shadow-premium"><label className="text-xs md:col-span-2">Nom<input value={legacyForm.name} onChange={(e) => setLegacyForm({ ...legacyForm, name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" /></label><label className="text-xs">Quantité<input type="number" value={legacyForm.quantity} onChange={(e) => setLegacyForm({ ...legacyForm, quantity: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" /></label><label className="text-xs">Seuil<input type="number" value={legacyForm.threshold} onChange={(e) => setLegacyForm({ ...legacyForm, threshold: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" /></label><label className="text-xs">Catégorie<input value={legacyForm.tag} onChange={(e) => setLegacyForm({ ...legacyForm, tag: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3" /></label><div className="md:col-span-5 flex justify-end"><button onClick={addLegacy} className="rounded-full bg-[#0A192F] text-white px-5 py-3">Créer le produit libre</button></div></div>}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 md:p-5 shadow-premium space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="relative"><span className="sr-only">Rechercher</span><Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit ou une nuance" className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-3" /></label>
          <label><span className="sr-only">Filtrer par marque</span><select value={brand} onChange={(e) => { setBrand(e.target.value); setCategory(""); }} className="w-full rounded-xl border border-slate-200 px-3 py-3"><option value="">Toutes les marques</option>{brands.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label><span className="sr-only">Filtrer par catégorie</span><select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-3"><option value="">Toutes les catégories</option>{categories.map((x) => <option key={x}>{x}</option>)}</select></label>
        </div>
        <div className="flex flex-wrap gap-2 items-center"><button onClick={() => setOrderOnly(!orderOnly)} className={`rounded-full px-4 py-2 text-sm flex items-center gap-1 ${orderOnly ? "bg-red-700 text-white" : "border border-red-200 text-red-700"}`}><Bell className="w-4 h-4" /> À commander</button><button onClick={reset} className="rounded-full px-4 py-2 text-sm border border-slate-200 flex items-center gap-1"><SlidersHorizontal className="w-4 h-4" /> Réinitialiser</button><label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} className="w-4 h-4 accent-[#0A192F]" /> Afficher les tarifs</label></div>
        {showPrices && <div className="text-sm text-right">Valeur totale du stock visible : <strong>{euro(total)}</strong></div>}
      </div>

      {filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">{list.length === 0 ? "Aucun produit en stock. Ajoutez votre première référence depuis le catalogue." : "Aucun produit ne correspond à ces filtres."}</div> : Object.entries(grouped).map(([b, cats]) => {
        const brandKey = `b:${b}`; const closed = collapsed[brandKey];
        return <section key={b} className="space-y-3"><button onClick={() => setCollapsed({ ...collapsed, [brandKey]: !closed })} className="w-full flex items-center gap-2 text-left"><span className="p-1 rounded-full bg-slate-100">{closed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span><h2 className="font-serif text-2xl">{b}</h2></button>{!closed && Object.entries(cats).map(([c, items]) => { const key = `${b}:${c}`; const catClosed = collapsed[key]; return <div key={c} className="ml-0 md:ml-4"><button onClick={() => setCollapsed({ ...collapsed, [key]: !catClosed })} className="w-full flex items-center gap-2 text-left mb-2"><span>{catClosed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{c} · {items.length}</h3></button>{!catClosed && <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{items.map((item) => <StockLine key={item.id} item={item} showPrices={showPrices} onChanged={load} />)}</div>}</div>})}</section>;
      })}
      {showAdd && <AddProductDialog catalog={catalog} stockItems={list} onClose={() => setShowAdd(false)} onAdded={handleProductAdded} />}
    </div>
  );
}
