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
