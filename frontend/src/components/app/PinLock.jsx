import React, { useEffect, useState } from "react";
import { api, pinStorage } from "@/lib/api";
import { Lock, Delete } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const PIN_LENGTH = 6;

function Keypad({ onDigit, onDelete, disabled }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", null, "0", "del"];
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-xs mx-auto">
      {keys.map((k, i) => {
        if (k === null) return <div key={`blank-${i}`} />;
        if (k === "del") {
          return (
            <button
              key="del"
              type="button"
              disabled={disabled}
              onClick={onDelete}
              data-testid="pin-del"
              className="h-16 rounded-2xl bg-slate-800/40 backdrop-blur-sm text-white text-2xl flex items-center justify-center hover:bg-slate-700/50 active:scale-95 transition disabled:opacity-40"
            >
              <Delete className="w-6 h-6" />
            </button>
          );
        }
        return (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onDigit(k)}
            data-testid={`pin-key-${k}`}
            className="h-16 rounded-2xl bg-white/10 backdrop-blur-sm text-white text-2xl font-light flex items-center justify-center hover:bg-white/20 active:scale-95 transition disabled:opacity-40"
          >
            {k}
          </button>
        );
      })}
    </div>
  );
}

function Dots({ length, count, shake }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${shake ? "animate-shake" : ""}`}>
      {Array.from({ length }).map((_, i) => (
        <span
          key={i}
          className={`w-3.5 h-3.5 rounded-full border transition-colors ${i < count ? "bg-[#D4AF37] border-[#D4AF37]" : "border-white/40"}`}
        />
      ))}
    </div>
  );
}

export default function PinLock({ mode = "unlock", onSuccess }) {
  const { activeCompany } = useAuth();
  const companyName = activeCompany?.name || "Mon entreprise";
  // mode: "unlock" | "setup"
  const [phase, setPhase] = useState(mode === "setup" ? "new" : "unlock"); // "new" | "confirm" | "unlock"
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const reset = () => { setPin(""); };
  const shakeIt = () => { setShake(true); setTimeout(() => setShake(false), 500); };

  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return;
    (async () => {
      if (phase === "unlock") {
        setBusy(true);
        try {
          const r = await api.post("/pin/unlock", { pin, ttl_seconds: 15 * 60 });
          pinStorage.set(r.data.token, r.data.expires_in);
          onSuccess?.();
        } catch (e) {
          shakeIt();
          reset();
          toast.error(e.response?.data?.detail || "PIN incorrect");
        } finally {
          setBusy(false);
        }
      } else if (phase === "new") {
        setFirstPin(pin);
        setPin("");
        setPhase("confirm");
      } else if (phase === "confirm") {
        if (pin !== firstPin) {
          shakeIt();
          setPin("");
          setFirstPin("");
          setPhase("new");
          toast.error("Les deux PIN ne correspondent pas");
          return;
        }
        setBusy(true);
        try {
          const r = await api.post("/pin/set", { pin, ttl_seconds: 15 * 60 });
          pinStorage.set(r.data.token, r.data.expires_in);
          toast.success("PIN configuré");
          onSuccess?.();
        } catch (e) {
          toast.error(e.response?.data?.detail || "Erreur");
          setPin("");
          setFirstPin("");
          setPhase("new");
        } finally {
          setBusy(false);
        }
      }
    })();
  }, [pin]);   // eslint-disable-line react-hooks/exhaustive-deps

  const title =
    phase === "new" ? "Créez votre PIN"
    : phase === "confirm" ? "Confirmez votre PIN"
    : companyName;
  const subtitle =
    phase === "new" ? "6 chiffres pour verrouiller votre app"
    : phase === "confirm" ? "Saisissez-le à nouveau"
    : "Saisissez votre PIN pour continuer";

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-between py-10 px-6 text-white"
      style={{ background: "linear-gradient(180deg, #0A192F 0%, #1E3A8A 100%)" }}
      data-testid="pin-lock-screen"
    >
      <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full">
        <div className="w-14 h-14 rounded-full border border-[#D4AF37]/40 flex items-center justify-center">
          <Lock className="w-6 h-6 text-[#D4AF37]" />
        </div>
        <div className="text-center">
          <div className="text-[10px] tracking-[0.3em] uppercase text-white/50 mb-2">{companyName}</div>
          <h1 className="font-serif text-3xl mb-2" data-testid="pin-title">{title}</h1>
          <div className="text-sm text-white/70" data-testid="pin-subtitle">{subtitle}</div>
        </div>
        <div className="my-6">
          <Dots length={PIN_LENGTH} count={pin.length} shake={shake} />
        </div>
      </div>
      <div className="w-full max-w-xs">
        <Keypad
          disabled={busy}
          onDigit={(d) => setPin((v) => (v.length < PIN_LENGTH ? v + d : v))}
          onDelete={() => setPin((v) => v.slice(0, -1))}
        />
      </div>
    </div>
  );
}
