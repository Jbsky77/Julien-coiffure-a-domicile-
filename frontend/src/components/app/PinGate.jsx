import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { API, pinStorage } from "@/lib/api";
import PinLock from "@/components/app/PinLock";
import { Scissors } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const INACTIVITY_MS = 15 * 60 * 1000; // 15 minutes

/**
 * PinGate — wraps the app with a lock screen.
 * - Fetches /pin/status once (with retries — handles backend cold-start)
 * - If not configured → shows setup flow (create PIN)
 * - If configured but no valid local token → shows unlock screen
 * - When unlocked, mounts children and starts an inactivity timer
 *   that re-locks after INACTIVITY_MS.
 */
export default function PinGate({ children }) {
  const { activeCompany } = useAuth();
  const companyName = activeCompany?.name || "Mon entreprise";
  const [status, setStatus] = useState({ loading: true, configured: false, error: false });
  const [unlocked, setUnlocked] = useState(false);
  const [loadingElapsed, setLoadingElapsed] = useState(0); // seconds since load started
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    // Retry up to ~60s (12 attempts × 5s) to handle backend cold-start.
    setStatus((s) => ({ ...s, loading: true, error: false }));
    let lastErr = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        const r = await axios.get(`${API}/pin/status`, { timeout: 8000 });
        const configured = !!r.data?.configured;
        const now = Date.now();
        const stillValid = configured && pinStorage.get() && pinStorage.expiresAt() > now;
        setStatus({ loading: false, configured, error: false });
        setUnlocked(!configured || !!stillValid);
        return;
      } catch (e) {
        lastErr = e;
        // Wait 5s before retry (except on last attempt)
        if (attempt < 11) {
          await new Promise((res) => setTimeout(res, 5000));
        }
      }
    }
    // All retries failed → show error screen with manual retry.
    console.warn("PinGate: /pin/status failed after retries", lastErr);
    setStatus({ loading: false, configured: false, error: true });
    setUnlocked(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Tick the elapsed counter while loading so we can show progressive messages.
  useEffect(() => {
    if (!status.loading) { setLoadingElapsed(0); return undefined; }
    const started = Date.now();
    const id = setInterval(() => setLoadingElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [status.loading]);

  // Listen for global "locked" events (401 Locked from any API call).
  useEffect(() => {
    const onLocked = () => setUnlocked(false);
    window.addEventListener("jb:locked", onLocked);
    return () => window.removeEventListener("jb:locked", onLocked);
  }, []);

  // Inactivity timer — resets on any user interaction while unlocked.
  useEffect(() => {
    if (!unlocked) return undefined;
    const arm = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        pinStorage.clear();
        setUnlocked(false);
      }, INACTIVITY_MS);
    };
    arm();
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [unlocked]);

  if (status.loading) {
    const msg =
      loadingElapsed < 3 ? "Chargement…"
      : loadingElapsed < 15 ? "Réveil du serveur, quelques secondes…"
      : loadingElapsed < 40 ? "Encore un instant, presque prêt…"
      : "Connexion plus lente que prévu, on continue…";
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center text-white px-6"
        style={{ background: "linear-gradient(180deg, #0A192F 0%, #1E3A8A 100%)" }}
        data-testid="pin-gate-loading"
      >
        <div className="w-16 h-16 rounded-full border border-[#D4AF37]/40 flex items-center justify-center mb-6">
          <Scissors className="w-6 h-6 text-[#D4AF37] animate-pulse" strokeWidth={1.5} />
        </div>
        <div className="text-[10px] tracking-[0.3em] uppercase text-white/50 mb-2">Espace professionnel</div>
        <div className="font-serif text-xl mb-6">{companyName}</div>
        <div className="flex items-center gap-2 text-white/80 text-sm mb-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[#D4AF37] animate-ping" />
          <span data-testid="loading-message">{msg}</span>
        </div>
        {loadingElapsed >= 10 && (
          <div className="text-[11px] text-white/50 mt-1 text-center max-w-xs">
            Le serveur redémarre après une période d&apos;inactivité. Cela peut prendre jusqu&apos;à 30 secondes au premier lancement.
          </div>
        )}
      </div>
    );
  }
  if (status.error) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center text-white px-6 text-center"
        style={{ background: "linear-gradient(180deg, #0A192F 0%, #1E3A8A 100%)" }}
        data-testid="pin-gate-error"
      >
        <div className="w-16 h-16 rounded-full border border-red-400/60 flex items-center justify-center mb-6">
          <Scissors className="w-6 h-6 text-red-300" strokeWidth={1.5} />
        </div>
        <div className="font-serif text-xl mb-2">Serveur injoignable</div>
        <div className="text-sm text-white/70 max-w-xs mb-6">
          Impossible de contacter le serveur. Vérifiez votre connexion internet, puis réessayez.
        </div>
        <button
          onClick={load}
          data-testid="pin-gate-retry"
          className="bg-[#D4AF37] text-[#0A192F] font-medium rounded-full px-6 py-2.5 text-sm"
        >
          Réessayer
        </button>
      </div>
    );
  }
  if (!unlocked) {
    return (
      <PinLock
        mode={status.configured ? "unlock" : "setup"}
        onSuccess={() => { setUnlocked(true); setStatus((s) => ({ ...s, configured: true })); }}
      />
    );
  }
  return children;
}
