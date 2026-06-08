"use client";

import React, { createContext, useContext, useState } from "react";

export type UserRole = "root" | "admin" | "user" | "guest";

export interface User {
  id: string;
  username: string;
  role: UserRole;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoginOpen: boolean;
  setIsLoginOpen: (open: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => false,
  logout: () => {},
  isLoginOpen: false,
  setIsLoginOpen: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Default to root user — replace with real auth logic when ready
  const [user, setUser] = useState<User | null>({
    id: "1",
    username: "admin",
    role: "root",
  });
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  const login = async (username: string, _password: string): Promise<boolean> => {
    // TODO: replace with real API call
    setUser({ id: "1", username, role: "admin" });
    setIsLoginOpen(false);
    return true;
  };

  const logout = () => {
    setUser({ id: "0", username: "guest", role: "guest" });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoginOpen, setIsLoginOpen }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
