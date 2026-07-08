import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Camera, Upload, Trash2, Share2, Download, Mail, MessageSquare, X, Image as ImageIcon, Smartphone, Square } from "lucide-react";
import { toast } from "sonner";

// Compress image to max 1280px width, JPEG ~0.85 quality, returns dataURL
async function compressImage(file, maxW = 1280) {
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      res(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = rej;
    img.src = dataUrl;
  });
}

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function downloadDataUrl(dataUrl, name) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = name;
  a.click();
}

function loadImg(src) {
  return new Promise((res, rej) => {
    if (!src) return res(null);
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

// Cover-fit draw of img into rect (x,y,w,h)
function drawCover(ctx, img, x, y, w, h) {
  if (!img) {
    ctx.fillStyle = "#1a2238";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#475569";
    ctx.font = "300 28px Georgia";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("—", x + w / 2, y + h / 2);
    return;
  }
  const ir = img.width / img.height;
  const tr = w / h;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (ir > tr) {
    sw = img.height * tr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / tr;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// Generate social media image. format: "square" (1080x1080) | "story" (1080x1920)
async function generateSocialImage(pair, brandName, format = "square") {
  const W = 1080;
  const H = format === "story" ? 1920 : 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Background gradient (navy)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0A192F");
  bg.addColorStop(1, "#1E3A8A");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Top label
  ctx.fillStyle = "#D4AF37";
  ctx.font = "300 22px 'Outfit', Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("AVANT  ·  APRÈS", W / 2, 60);

  // Decorative line under title
  ctx.strokeStyle = "#D4AF37";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 60, 100);
  ctx.lineTo(W / 2 + 60, 100);
  ctx.stroke();

  const [imgB, imgA] = await Promise.all([loadImg(pair.before), loadImg(pair.after)]);

  const PAD = 40;
  const FOOTER = 180;
  const TOP = 140;
  const usableH = H - TOP - FOOTER;

  if (format === "story") {
    // Stacked vertically with labels
    const cellH = (usableH - PAD) / 2;
    drawCover(ctx, imgB, PAD, TOP, W - PAD * 2, cellH);
    drawCover(ctx, imgA, PAD, TOP + cellH + PAD, W - PAD * 2, cellH);
    // Labels
    ctx.fillStyle = "rgba(10,25,47,0.8)";
    ctx.fillRect(PAD, TOP, 220, 60);
    ctx.fillRect(PAD, TOP + cellH + PAD, 220, 60);
    ctx.fillStyle = "#D4AF37";
    ctx.font = "600 22px 'Outfit', Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("AVANT", PAD + 28, TOP + 30);
    ctx.fillText("APRÈS", PAD + 28, TOP + cellH + PAD + 30);
  } else {
    // Side by side
    const cellW = (W - PAD * 3) / 2;
    drawCover(ctx, imgB, PAD, TOP, cellW, usableH);
    drawCover(ctx, imgA, PAD * 2 + cellW, TOP, cellW, usableH);
    // Labels
    ctx.fillStyle = "rgba(10,25,47,0.8)";
    ctx.fillRect(PAD, TOP, 200, 56);
    ctx.fillRect(PAD * 2 + cellW, TOP, 200, 56);
    ctx.fillStyle = "#D4AF37";
    ctx.font = "600 22px 'Outfit', Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("AVANT", PAD + 24, TOP + 28);
    ctx.fillText("APRÈS", PAD * 2 + cellW + 24, TOP + 28);
  }

  // Footer with brand
  const footerY = H - FOOTER;
  ctx.fillStyle = "rgba(10,25,47,0.92)";
  ctx.fillRect(0, footerY, W, FOOTER);
  // Gold separator line
  ctx.strokeStyle = "#D4AF37";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, footerY);
  ctx.lineTo(W, footerY);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "italic 300 30px Georgia, serif";
  ctx.textBaseline = "top";
  ctx.fillText("Coiffure à domicile", W / 2, footerY + 42);

  ctx.fillStyle = "#D4AF37";
  ctx.font = "600 56px Georgia, serif";
  ctx.fillText(brandName || "Julien", W / 2, footerY + 80);

  return canvas.toDataURL("image/jpeg", 0.92);
}

export default function ClientPhotos({ clientId, clientName }) {
  const [pairs, setPairs] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ before: null, after: null, note: "", date: new Date().toISOString().slice(0, 10) });
  const beforeRef = useRef(null);
  const afterRef = useRef(null);
  const [brandName, setBrandName] = useState("Julien");
  const [socialPreview, setSocialPreview] = useState(null); // { dataUrl, format, pairId }

  useEffect(() => {
    api.get("/settings").then((r) => setBrandName(r.data.brand_name || "Julien")).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const r = await api.get(`/clients/${clientId}/photos`);
    setPairs(r.data);
  }, [clientId]);
  useEffect(() => { if (clientId) load(); }, [clientId, load]);

  const onPick = async (kind, e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) return toast.error("Photo trop lourde (max 15 Mo)");
    try {
      const compressed = await compressImage(f);
      setForm((s) => ({ ...s, [kind]: compressed }));
    } catch {
      toast.error("Impossible de lire cette image");
    }
  };

  const save = async () => {
    if (!form.before && !form.after) return toast.error("Ajoutez au moins une photo (avant ou après)");
    await api.post(`/clients/${clientId}/photos`, form);
    toast.success("Photos enregistrées");
    setForm({ before: null, after: null, note: "", date: new Date().toISOString().slice(0, 10) });
    setAdding(false);
    load();
  };

  const remove = async (pid) => {
    if (!window.confirm("Supprimer ces photos ?")) return;
    await api.delete(`/clients/${clientId}/photos/${pid}`);
    load();
  };

  const sharePair = async (pair) => {
    const files = [];
    if (pair.before) files.push(new File([dataUrlToBlob(pair.before)], `avant-${pair.id}.jpg`, { type: "image/jpeg" }));
    if (pair.after) files.push(new File([dataUrlToBlob(pair.after)], `apres-${pair.id}.jpg`, { type: "image/jpeg" }));
    const text = `Avant / Après — ${clientName}${pair.note ? "\n" + pair.note : ""} · Julien Bouche`;
    if (navigator.canShare && navigator.canShare({ files })) {
      try {
        await navigator.share({ files, title: "Avant / Après", text });
        return;
      } catch (e) { /* user cancelled */ }
    }
    toast.message("Partage natif indisponible — utilisez les boutons WhatsApp / Email / Télécharger.");
  };

  const shareWhatsApp = (pair) => {
    const text = encodeURIComponent(`Avant / Après — ${clientName}${pair.note ? "\n" + pair.note : ""}\nJulien Bouche`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const shareEmail = (pair) => {
    const subject = encodeURIComponent(`Avant / Après — ${clientName}`);
    const body = encodeURIComponent(`Bonjour,\n\nVoici votre transformation avant/après.${pair.note ? "\n\n" + pair.note : ""}\n\nÀ très vite,\n${brandName}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const buildSocial = async (pair, format) => {
    if (!pair.before && !pair.after) return toast.error("Pas de photo");
    try {
      const dataUrl = await generateSocialImage(pair, brandName, format);
      setSocialPreview({ dataUrl, format, pairId: pair.id });
    } catch (e) {
      toast.error("Erreur de génération");
    }
  };

  const shareSocial = async () => {
    if (!socialPreview) return;
    try {
      const blob = dataUrlToBlob(socialPreview.dataUrl);
      const file = new File([blob], `avant-apres-${socialPreview.pairId}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Avant / Après", text: `Avant·Après — ${brandName}` });
        return;
      }
      toast.message("Partage natif indisponible — utilisez Télécharger.");
    } catch {}
  };

  return (
    <div className="space-y-4" data-testid="client-photos">
      {!adding && (
        <button onClick={() => setAdding(true)} data-testid="add-photos-btn" className="w-full bg-pink-500 hover:bg-pink-600 text-white rounded-full px-6 py-3 font-medium flex items-center justify-center gap-2">
          <Camera className="w-4 h-4" /> Ajouter des photos avant / après
        </button>
      )}

      {adding && (
        <div className="bg-white border-2 border-pink-200 rounded-2xl p-5 space-y-4" data-testid="photo-add-form">
          <div className="flex items-center justify-between">
            <div className="font-medium">Nouvelles photos</div>
            <button onClick={() => { setAdding(false); setForm({ before: null, after: null, note: "", date: new Date().toISOString().slice(0, 10) }); }} className="p-2 rounded-full hover:bg-slate-50"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[{ k: "before", l: "Avant", ref: beforeRef }, { k: "after", l: "Après", ref: afterRef }].map((s) => (
              <div key={s.k}>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">{s.l}</div>
                <input ref={s.ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPick(s.k, e)} data-testid={`photo-input-${s.k}`} />
                <button onClick={() => s.ref.current?.click()} data-testid={`photo-pick-${s.k}`} className={`w-full aspect-square rounded-xl border-2 border-dashed flex items-center justify-center text-xs text-slate-500 ${form[s.k] ? "border-transparent" : "border-slate-300 hover:border-pink-400"}`}>
                  {form[s.k] ? <img src={form[s.k]} alt={s.l} className="w-full h-full object-cover rounded-xl" /> : (<><Upload className="w-5 h-5 mr-1" /> Choisir</>)}
                </button>
              </div>
            ))}
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-500">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full bg-transparent border-b border-slate-300 px-0 py-2 focus:border-[#0A192F] focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-slate-500">Note (optionnel)</label>
            <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ex : Coloration balayage" className="w-full bg-transparent border-b border-slate-300 px-0 py-2 focus:border-[#0A192F] focus:outline-none" />
          </div>
          <button onClick={save} data-testid="save-photos-btn" className="w-full bg-[#0A192F] text-white rounded-full px-6 py-3 font-medium">Enregistrer</button>
        </div>
      )}

      {pairs.length === 0 && !adding && (
        <div className="text-slate-400 text-sm py-10 text-center">Aucune photo pour le moment.</div>
      )}

      <div className="space-y-4">
        {pairs.map((p) => (
          <div key={p.id} className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3" data-testid={`photo-pair-${p.id}`}>
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500">{new Date(p.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</div>
              <button onClick={() => remove(p.id)} data-testid={`del-photo-${p.id}`} className="p-2 rounded-full text-[#991B1B] hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">Avant</div>
                {p.before ? <img src={p.before} alt="Avant" className="w-full aspect-square object-cover rounded-xl" /> : <div className="w-full aspect-square bg-slate-50 rounded-xl flex items-center justify-center text-xs text-slate-300">—</div>}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">Après</div>
                {p.after ? <img src={p.after} alt="Après" className="w-full aspect-square object-cover rounded-xl" /> : <div className="w-full aspect-square bg-slate-50 rounded-xl flex items-center justify-center text-xs text-slate-300">—</div>}
              </div>
            </div>
            {p.note && <div className="text-sm italic text-slate-600">{p.note}</div>}
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => sharePair(p)} data-testid={`share-pair-${p.id}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0A192F] text-white text-xs"><Share2 className="w-3.5 h-3.5" /> Partager</button>
              <button onClick={() => buildSocial(p, "square")} data-testid={`social-square-${p.id}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold-gradient text-white text-xs"><Square className="w-3.5 h-3.5" /> Insta post</button>
              <button onClick={() => buildSocial(p, "story")} data-testid={`social-story-${p.id}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold-gradient text-white text-xs"><Smartphone className="w-3.5 h-3.5" /> Story</button>
              <button onClick={() => shareWhatsApp(p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500 text-white text-xs"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp</button>
              <button onClick={() => shareEmail(p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 text-xs"><Mail className="w-3.5 h-3.5" /> Email</button>
              {p.before && <button onClick={() => downloadDataUrl(p.before, `avant-${p.id}.jpg`)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 text-xs"><Download className="w-3.5 h-3.5" /> Avant</button>}
              {p.after && <button onClick={() => downloadDataUrl(p.after, `apres-${p.id}.jpg`)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 text-xs"><Download className="w-3.5 h-3.5" /> Après</button>}
            </div>
          </div>
        ))}
      </div>

      {socialPreview && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" data-testid="social-preview-modal" onClick={() => setSocialPreview(null)}>
          <div className="bg-white rounded-3xl p-4 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-slate-500">Visuel {socialPreview.format === "story" ? "Story" : "Post Instagram"}</div>
                <div className="font-serif text-xl">Avant · Après</div>
              </div>
              <button onClick={() => setSocialPreview(null)} className="p-2 rounded-full hover:bg-slate-100" data-testid="social-close"><X className="w-4 h-4" /></button>
            </div>
            <img src={socialPreview.dataUrl} alt="Visuel social" className="w-full rounded-xl" />
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={shareSocial} data-testid="social-share-btn" className="flex-1 bg-[#0A192F] text-white rounded-full px-4 py-2.5 text-sm flex items-center justify-center gap-2"><Share2 className="w-4 h-4" /> Partager</button>
              <button onClick={() => downloadDataUrl(socialPreview.dataUrl, `avant-apres-${socialPreview.format}-${socialPreview.pairId}.jpg`)} data-testid="social-dl-btn" className="flex-1 bg-gold-gradient text-white rounded-full px-4 py-2.5 text-sm flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Télécharger</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
