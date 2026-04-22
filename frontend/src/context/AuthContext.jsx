import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const Ctx = createContext(null);

// Auth disabled: always logged in as local Julien user
const LOCAL_USER = { user_id: "local-julien", email: "julien@local", name: "Julien Bouche", picture: "" };

export function AuthProvider({ children }) {
  const [user] = useState(LOCAL_USER);
  const [loading] = useState(false);

  const logout = async () => {};

  return (
    <Ctx.Provider value={{ user, setUser: () => {}, loading, logout, checkAuth: async () => {} }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
