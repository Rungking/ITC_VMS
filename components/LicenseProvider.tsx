"use client";

import React, { createContext, useContext } from "react";

interface LicenseContextType {
  isValid: boolean;
  daysRemaining: number | null;
}

const LicenseContext = createContext<LicenseContextType>({
  isValid: true,
  daysRemaining: null,
});

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  // TODO: replace with real license validation when needed
  return (
    <LicenseContext.Provider value={{ isValid: true, daysRemaining: null }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  return useContext(LicenseContext);
}
