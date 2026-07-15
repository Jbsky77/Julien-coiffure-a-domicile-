import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Beaker, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { catalogSearchMatches, normalizeStockText as clean, stockQuantity as q } from "@/lib/stockDomain";
import { toast } from "sonner";

const DOSES = [
  { value: "full", label: "Dose complÃ¨te", units: 1 },
  { value: "half", label: "Demi-dose", units: 0.5 },
  { value: "quarter", label: "Quart de dose", units: 0.25 },
  { value: "custom", label: "Dose personnalisÃ©e", units: null },
];

const quantityLabel = (value, unit = "unitÃ©") => `${q(value).toLocaleString("fr-FR", { maximumFractionDigits: 4 })} ${unit}${Math.abs(q(value)) > 1 ? "s" : ""}`;

export default function ProductUsageEditor({ value, onChange, readOnly = false, onSave, saving = false }) {
  const [catalog, setCatalog] = useState([]);
  const [stock, setStock] = useState([]);
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [range, setRange] = useState("");
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([api.get("/stock/catalog"), api.get("/stock")]);
      setCatalog(c.data.products || []);
      setStock(s.data || []);
    } catch { toast.error("Impossible de charger le catalogue de produits"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const brands = useMemo(() => [...new Set(catalog.map((p) => p.brand))], [catalog]);
  const categories = useMemo(() => [...new Set(catalog.filter((p) => !brand || p.brand === brand).map((p) => p.normalizedCategory))], [catalog, brand]);
  const ranges = useMemo(() => [...new Set(catalog.filter((p) => (!brand || p.brand === brand) && (!category || p.normalizedCategory === category)).map((p) => p.range))], [catalog, brand, category]);
  const products = useMemo(() => {
    const term = clean(search);
    return catalog.filter((p) => {
      if (brand && p.brand !== brand) return false;
      if (category && p.normalizedCategory !== category) return false;
      if (range && p.range !== range) return false;
      if (!term) return true;
      return catalogSearchMatches(p, term);
    }).slice(0, 150);
  }, [catalog, brand, category, range, search]);
  const stockByProduct = useMemo(() => Object.fromEntries(stock.filter((s) => s.catalog_product_id).map((s) => [s.catalog_product_id, s])), [stock]);

  const add = () => {
    const product = catalog.find((p) => p.id === productId);
    if (!product) return toast.error("SÃ©lectionnez un produit");
    const line = {
      id: `use_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
      catalog_product_id: product.id,
      stock_item_id: stockByProduct[product.id]?.id || null,
      dose_type: "full",
      used_stock_units: 1,
      physical_amount: null,
      physical_amount_unit: product.packageAmountUnit || null,
      technical_note: "",
      product_snapshot: product,
      consumption_status: "draft",
    };
    onChange([...(value || []), line]);
    setProductId("");
  };

  const update = (id, changes) => onChange((value || []).map((line) => line.id === id ? { ...line, ...changes } : line));
  const remove = (id) => onChange((value || []).filter((line) => line.id !== id));
  const productFor = (line) => catalog.find((p) => p.id === line.catalog_product_id) || line.product_snapshot || {};

  return (
    <section className="bg-white border border-slate-100 rounded-2xl p-5 md:p-6 shadow-premium space-y-5" data-testid="product-usage-editor">
      <div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-slate-500 flex items-center gap-2"><Beaker className="w-4 h-4 text-[#D4AF37]" /> Formule technique</div>
        <h2 className="font-serif text-2xl mt-1">Produits utilisÃ©s</h2>
        <p className="text-xs text-slate-500 mt-1">Le stock est dÃ©comptÃ© uniquement lorsque le rendez-vous est terminÃ©.</p>
      </div>

      {!readOnly && (
        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-4" data-testid="usage-product-picker">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs text-slate-600">Marque
              <select value={brand} onChange={(e) => { setBrand(e.target.value); setCategory(""); setRange(""); setProductId(""); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">
                <option value="">Toutes</option>{brands.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-600">CatÃ©gorie
              <select value={category} onChange={(e) => { setCategory(e.target.value); setRange(""); setProductId(""); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">
                <option value="">Toutes</option>{categories.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-600">Gamme
              <select value={range} onChange={(e) => { setRange(e.target.value); setProductId(""); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3">
                <option value="">Toutes</option>{ranges.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
          </div>
          <label className="text-xs text-slate-600 block">Recherche produit
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, gamme, code couleur, nuanceâ€¦" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3" />
          </label>
          <div className="flex flex-col md:flex-row gap-3">
            <label className="text-xs text-slate-600 flex-1">Produit et nuance/format
              <select value={productId} onChange={(e) => setProductId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3" data-testid="usage-product-select">
                <option value="">SÃ©lectionnerâ€¦</option>
                {products.map((p) => {
                  const available = stockByProduct[p.id]?.quantity || 0;
                  const detail = [p.shadeCode, p.shadeName, p.format].filter(Boolean).join(" Â· ");
                  return <option key={p.id} value={p.id}>{p.range} â€” {p.productName}{detail ? ` â€” ${detail}` : ""} â€” stock {q(available).toLocaleString("fr-FR")}</option>;
                })}
              </select>
            </label>
            <button type="button" onClick={add} className="md:self-end rounded-full bg-[#0A192F] text-white px-5 py-3 flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Ajouter</button>
          </div>
        </div>
      )}

      {(value || []).length === 0 ? <div className="text-sm text-slate-400 text-center py-5">Aucun produit dans la formule.</div> : (
        <div className="space-y-3">
          {(value || []).map((line) => {
            const product = productFor(line);
            const currentStock = stockByProduct[line.catalog_product_id]?.quantity ?? line.stock_after ?? 0;
            const available = line.consumption_status === "applied" ? q(currentStock + Number(line.previous_used_stock_units ?? line.used_stock_units ?? 0)) : currentStock;
            const after = q(available - line.used_stock_units);
            const unit = product.stockUnit || "unitÃ©";
            const insufficient = after < 0;
            return (
              <article key={line.id} className="rounded-2xl border border-slate-200 p-4 space-y-3" data-testid={`usage-line-${line.id}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{product.productName || "Produit"} {product.shadeCode || ""}</div>
                    <div className="text-xs text-slate-500">{product.brand} Â· {product.range}{product.shadeName ? ` Â· ${product.shadeName}` : ""}{product.format ? ` Â· ${product.format}` : ""}</div>
                    <div className="text-xs mt-1">Disponible avant utilisation : <strong>{quantityLabel(available, unit)}</strong></div>
                  </div>
                  {!readOnly && <button type="button" onClick={() => remove(line.id)} aria-label="Supprimer ce produit" className="p-2 rounded-full text-[#991B1B] hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="text-xs text-slate-600">Dose
                    <select disabled={readOnly} value={line.dose_type} onChange={(e) => {
                      const dose = DOSES.find((d) => d.value === e.target.value);
                      update(line.id, { dose_type: dose.value, ...(dose.units ? { used_stock_units: dose.units } : {}) });
                    }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                      {DOSES.map((dose) => <option key={dose.value} value={dose.value}>{dose.label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">Fraction dÃ©comptÃ©e
                    <input disabled={readOnly || line.dose_type !== "custom"} type="number" min="0.0001" step="0.05" value={line.used_stock_units} onChange={(e) => update(line.id, { used_stock_units: q(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 disabled:bg-slate-50" />
                  </label>
                  <label className="text-xs text-slate-600">QuantitÃ© physique {product.packageAmount ? `(sur ${product.packageAmount} ${product.packageAmountUnit})` : "(facultatif)"}
                    <input disabled={readOnly || !product.packageAmount} type="number" min="0" step="0.1" value={line.physical_amount ?? ""} onChange={(e) => {
                      const physical = e.target.value === "" ? null : Number(e.target.value);
                      update(line.id, { physical_amount: physical, physical_amount_unit: product.packageAmountUnit, ...(physical !== null ? { dose_type: "custom", used_stock_units: q(physical / product.packageAmount) } : {}) });
                    }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 disabled:bg-slate-50" />
                  </label>
                </div>
                <label className="text-xs text-slate-600 block">Commentaire technique
                  <input disabled={readOnly} value={line.technical_note || ""} onChange={(e) => update(line.id, { technical_note: e.target.value })} placeholder="MÃ©lange, oxydant, temps de pose, rÃ©sultatâ€¦" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 disabled:bg-slate-50" />
                </label>
                <div className={`text-sm rounded-xl px-3 py-2 border ${insufficient ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`} role={insufficient ? "alert" : undefined}>
                  {insufficient && <AlertTriangle className="w-4 h-4 inline mr-1" />} Stock aprÃ¨s utilisation : <strong>{quantityLabel(after, unit)}</strong>{insufficient ? " â€” consommation autorisÃ©e, produit Ã  commander" : ""}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {onSave && <button type="button" disabled={saving} onClick={async () => { await onSave(); await load(); }} className="rounded-full bg-[#0A192F] text-white px-5 py-3 disabled:opacity-60">{saving ? "Enregistrementâ€¦" : "Enregistrer la formule"}</button>}
    </section>
  );
}
