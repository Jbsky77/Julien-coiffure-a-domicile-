import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

export const money = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "0,00 €";
  return `${Number(n).toFixed(2).replace(".", ",")} €`;
};

export const money2 = (n) => {
  if (n === null || n === undefined) return "0,00";
  return Number(n).toFixed(2).replace(".", ",");
};

export const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
};

export const fmtTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

export const fmtMonth = (yyyymm) => {
  if (!yyyymm) return "";
  const [y, m] = yyyymm.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};

export const PAYMENT_MODES = [
  { id: "CB", label: "Carte Bancaire" },
  { id: "CHEQUE", label: "Chèque" },
  { id: "ESPECES", label: "Espèces" },
  { id: "VIREMENT", label: "Virement" },
];

// Gender helpers
export const computeAge = (birthday) => {
  if (!birthday) return null;
  try {
    const d = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age;
  } catch {
    return null;
  }
};

export const genderLabel = (g) => (g === "H" ? "M." : g === "F" ? "Mme" : "");

// Tailwind color classes by gender
export const genderClasses = (g) => {
  if (g === "H") return {
    bg: "bg-blue-50",
    border: "border-blue-200",
    accent: "bg-blue-500",
    text: "text-blue-900",
    pill: "bg-blue-100 text-blue-800 border-blue-200",
  };
  if (g === "F") return {
    bg: "bg-pink-50",
    border: "border-pink-200",
    accent: "bg-pink-500",
    text: "text-pink-900",
    pill: "bg-pink-100 text-pink-800 border-pink-200",
  };
  return {
    bg: "bg-white",
    border: "border-slate-100",
    accent: "bg-slate-400",
    text: "text-slate-900",
    pill: "bg-slate-100 text-slate-700 border-slate-200",
  };
};
