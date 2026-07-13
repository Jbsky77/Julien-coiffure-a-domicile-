import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

window.__JB_APP_VERSION__ = "2026-07-13-page-blanche-1";

async function clearLegacyBrowserCache() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("jb-")).map((key) => window.caches.delete(key)));
    }
  } catch (error) {
    console.warn("Nettoyage du cache ignoré", error);
  }
}

clearLegacyBrowserCache();

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Erreur de démarrage de l'application", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-7 text-center shadow-lg">
          <h1 className="font-serif text-3xl mb-3">L'application doit être actualisée</h1>
          <p className="text-sm text-slate-500 mb-6">Une ancienne version est restée dans le navigateur. Vos données sont conservées.</p>
          <button
            type="button"
            onClick={async () => {
              await clearLegacyBrowserCache();
              window.location.replace(`/?actualisation=${Date.now()}`);
            }}
            className="w-full bg-[#0A192F] text-white rounded-full px-6 py-4 font-medium"
          >
            Actualiser l'application
          </button>
        </div>
      </div>
    );
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
