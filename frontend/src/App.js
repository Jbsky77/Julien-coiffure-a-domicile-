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
      <Route path="/login" element={<Navigate to="/" replace />} />
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

// Router: separates the public client space (no PIN required) from the admin app.
function AppRouter() {
  return (
    <Routes>
      <Route path="/c/:token" element={<ClientSpace />} />
      <Route
        path="*"
        element={
          <PinGate>
            <RootRouter />
          </PinGate>
        }
      />
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
