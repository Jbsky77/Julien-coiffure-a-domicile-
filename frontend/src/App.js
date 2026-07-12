import React from "react";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import "@/App.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Toaster } from "sonner";
import Dashboard from "@/pages/Dashboard";
import Appointments from "@/pages/Appointments";
import AppointmentForm from "@/pages/AppointmentForm";
import Clients from "@/pages/Clients";
import ClientDetail from "@/pages/ClientDetail";
import Accounting from "@/pages/Accounting";
import Stock from "@/pages/Stock";
import Settings from "@/pages/Settings";
import Analytics from "@/pages/Analytics";
import Tour from "@/pages/Tour";
import ClientStatus from "@/pages/ClientStatus";
import MapPage from "@/pages/Map";
import ClientSpace from "@/pages/ClientSpace";
import AppointmentRequests from "@/pages/AppointmentRequests";
import Login from "@/pages/Login";
import Layout from "@/components/app/Layout";
import PinGate from "@/components/app/PinGate";

function Protected() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function RootRouter() {
  return (
    <Routes>
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
        <Route path="/tour" element={<Tour />} />
        <Route path="/clients-status" element={<ClientStatus />} />
        <Route path="/carte" element={<MapPage />} />
        <Route path="/demandes" element={<AppointmentRequests />} />
      </Route>
    </Routes>
  );
}

function PrivateApp() {
  const { user, loading, activeCompany } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Chargement…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!activeCompany) return <div className="min-h-screen flex items-center justify-center p-6 text-center">Aucune entreprise active n’est associée à ce compte.</div>;
  return <PinGate><RootRouter /></PinGate>;
}

// Router: public client space, login, then authenticated company application.
function AppRouter() {
  return (
    <Routes>
      <Route path="/c/:token" element={<ClientSpace />} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<PrivateApp />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRouter />
        <Toaster position="top-right" richColors closeButton />
      </BrowserRouter>
    </AuthProvider>
  );
}
