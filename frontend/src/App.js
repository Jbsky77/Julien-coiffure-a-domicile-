import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import "@/App.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Toaster } from "sonner";
import Dashboard from "@/pages/Dashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import Appointments from "@/pages/Appointments";
import AppointmentForm from "@/pages/AppointmentForm";
import Clients from "@/pages/Clients";
import ClientDetail from "@/pages/ClientDetail";
import Accounting from "@/pages/Accounting";
import Stock from "@/pages/Stock";
import Settings from "@/pages/Settings";
import Team from "@/pages/Team";
import Analytics from "@/pages/Analytics";
import Tour from "@/pages/Tour";
import ClientStatus from "@/pages/ClientStatus";
import MapPage from "@/pages/Map";
import ClientSpace from "@/pages/ClientSpace";
import AppointmentRequests from "@/pages/AppointmentRequests";
import Login from "@/pages/Login";
import Landing from "@/pages/Landing";
import Signup from "@/pages/Signup";
import AcceptInvite from "@/pages/AcceptInvite";
import ResetPassword from "@/pages/ResetPassword";
import Layout from "@/components/app/Layout";
import PinGate from "@/components/app/PinGate";
import SubscriptionGate from "@/components/app/SubscriptionGate";
import { repairMojibake } from "@/lib/api";

function useTextEncodingGuard() {
  useEffect(() => {
    const repairNode = (root) => {
      if (!root) return;
      if (root.nodeType === Node.TEXT_NODE) {
        const corrected = repairMojibake(root.nodeValue || "");
        if (corrected !== root.nodeValue) root.nodeValue = corrected;
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const corrected = repairMojibake(node.nodeValue || "");
        if (corrected !== node.nodeValue) node.nodeValue = corrected;
        node = walker.nextNode();
      }
    };

    repairNode(document.body);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") repairNode(mutation.target);
        mutation.addedNodes.forEach(repairNode);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
}

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
        <Route path="/app" element={<Dashboard />} />
        <Route path="/rdv" element={<Appointments />} />
        <Route path="/rdv/nouveau" element={<AppointmentForm />} />
        <Route path="/rdv/:id" element={<AppointmentForm />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/compta" element={<Accounting />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/reglages" element={<Settings />} />
        <Route path="/equipe" element={<Team />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/tour" element={<Tour />} />
        <Route path="/clients-status" element={<ClientStatus />} />
        <Route path="/carte" element={<MapPage />} />
        <Route path="/demandes" element={<AppointmentRequests />} />
      </Route>
    </Routes>
  );
}

function AdminRoute() {
  const { user, loading, isPlatformAdmin, activeCompany } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Chargement…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;
  if (activeCompany) return <Navigate to="/" replace />;
  return <AdminDashboard />;
}

function PrivateApp() {
  const { user, loading, activeCompany, isPlatformAdmin } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Chargement…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isPlatformAdmin && !activeCompany) return <Navigate to="/admin" replace />;
  if (!activeCompany) return <div className="min-h-screen flex items-center justify-center p-6 text-center">Aucune entreprise active n’est associée à ce compte.</div>;

  if (isPlatformAdmin) {
    return <RootRouter />;
  }

  return (
    <SubscriptionGate>
      <PinGate>
        <RootRouter />
      </PinGate>
    </SubscriptionGate>
  );
}

function AppRouter() {
  return (
    <Routes>
            <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<Signup />} />
<Route path="/c/:token" element={<ClientSpace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/admin" element={<AdminRoute />} />
      <Route path="*" element={<PrivateApp />} />
    </Routes>
  );
}

export default function App() {
  useTextEncodingGuard();

  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <AppRouter />
          <Toaster position="top-right" richColors closeButton />
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}
