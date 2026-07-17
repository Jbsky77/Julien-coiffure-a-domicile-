import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const { user } = useAuth();
  const key = user?.user_id ? `jb_theme_${user.user_id}` : "jb_theme_guest";
  const [preference, setPreference] = useState(() => localStorage.getItem(key) || "light");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setPreference(localStorage.getItem(key) || "light");
  }, [key]);

  useEffect(() => {
    const apply = () => {
      const dark = preference === "dark";
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      setIsDark(dark);
    };
    apply();
    localStorage.setItem(key, preference);
  }, [key, preference]);

  const value = useMemo(() => ({
    preference,
    isDark,
    setPreference,
    toggle: () => setPreference(isDark ? "light" : "dark"),
  }), [isDark, preference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

