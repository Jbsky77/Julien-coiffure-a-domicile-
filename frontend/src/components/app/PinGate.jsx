import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { API, pinStorage } from "@/lib/api";
import PinLock from "@/components/app/PinLock";

const INACTIVITY_MS = 15 * 60 * 1000; // 15 minutes

/**
 * PinGate — wraps the app with a lock screen.
 * - Fetches /pin/status once
 * - If not configured → shows setup flow (create PIN)
 * - If configured but no valid local token → shows unlock screen
 * - When unlocked, mounts children and starts an inactivity timer
 *   that re-locks after INACTIVITY_MS.
 */
export default function PinGate({ children }) {
  const [status, setStatus] = useState({ loading: true, configured: false });
  const [unlocked, setUnlocked] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/pin/status`);
      const configured = !!r.data?.configured;
      const now = Date.now();
      const stillValid = configured && pinStorage.get() && pinStorage.expiresAt() > now;
      setStatus({ loading: false, configured });
      setUnlocked(!configured || !!stillValid);
    } catch {
      setStatus({ loading: false, configured: false });
      setUnlocked(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
    return <div className="min-h-screen flex items-center justify-center bg-[#0A192F] text-white/70 text-sm">Chargement…</div>;
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
