import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, genderLabel } from "@/lib/api";
import { Search, X, User } from "lucide-react";

export default function GlobalSearch({ open, onClose }) {
  const [q, setQ] = useState("");
  const [clients, setClients] = useState([]);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setQ("");
    setTimeout(() => inputRef.current?.focus(), 50);
    api.get("/clients").then((r) => setClients(r.data || [])).catch(() => {});
  }, [open]);

  useEffect(() => {
    const onKey = (e) => {
      if (!open) return;
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return clients.slice(0, 12);
    return clients
      .filter((c) => {
        const hay = [c.first_name, c.last_name, c.phone, c.address, c.comment]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 30);
  }, [q, clients]);

  if (!open) return null;

  const go = (c) => {
    navigate(`/clients/${c.id}`);
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-14 sm:pt-20 px-4"
      onClick={onClose}
      data-testid="global-search-overlay"
    >
      <div
        className="w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un client (nom, téléphone, adresse)…"
            className="flex-1 bg-transparent focus:outline-none text-base"
            data-testid="global-search-input"
          />
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1"
            data-testid="global-search-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto" data-testid="global-search-results">
          {results.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Aucun résultat</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => go(c)}
                    data-testid={`search-result-${c.id}`}
                    className="w-full text-left px-5 py-3 hover:bg-slate-50 flex items-center gap-3"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${c.gender === "H" ? "bg-blue-100 text-blue-700" : c.gender === "F" ? "bg-pink-100 text-pink-700" : "bg-slate-100 text-slate-600"}`}>
                      <User className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {genderLabel(c.gender) && <span className="text-slate-400 mr-1">{genderLabel(c.gender)}</span>}
                        {c.first_name} {c.last_name}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {c.phone || "—"}
                        {c.address && <span className="ml-2">· {c.address}</span>}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
