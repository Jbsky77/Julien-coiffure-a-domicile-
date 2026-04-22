import React from "react";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Navigate, Outlet } from "react-router-dom";
import "@/App.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Toaster } from "sonner";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Appointments from "@/pages/Appointments";
import AppointmentForm from "@/pages/AppointmentForm";
import Clients from "@/pages/Clients";
import ClientDetail from "@/pages/ClientDetail";
import Accounting from "@/pages/Accounting";
import Stock from "@/pages/Stock";
import Settings from "@/pages/Settings";
import Analytics from "@/pages/Analytics";
import Layout from "@/components/app/Layout";

function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const processed = React.useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const hash = location.hash || window.location.hash;
    const match = hash.match(/session_id=([^&]+)/);
    const sid = match?.[1];
    (async () => {
      if (!sid) return navigate("/login", { replace: true });
      try {
        // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
        const r = await api.post("/auth/google/session", { session_id: sid });
        navigate("/", { replace: true, state: { user: r.data } });
      } catch (e) {
        navigate("/login", { replace: true });
      }
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="font-serif text-2xl text-[#0A192F]">Connexion…</div>
    </div>
  );
}

function Protected() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="font-serif text-2xl text-[#0A192F]">Chargement…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function RootRouter() {
  const location = useLocation();
  if ((location.hash || window.location.hash)?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/rdv" element={<Appointments />} />
        <Route path="/rdv/nouveau" element={<AppointmentForm />} />
        <Route path="/rdv/:id" element={<AppointmentForm />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/compta" element={<Accounting />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/reglages" element={<Settings />} />
        <Route path="/analytics" element={<Analytics />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RootRouter />
        <Toaster position="top-right" richColors closeButton />
      </BrowserRouter>
    </AuthProvider>
  );
}
