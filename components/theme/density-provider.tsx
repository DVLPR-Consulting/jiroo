"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Density = "comfy" | "compact";

const DensityContext = createContext<{ density: Density; setDensity: (d: Density) => void } | null>(
  null,
);

export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = useState<Density>("comfy");

  useEffect(() => {
    const d = document.documentElement.getAttribute("data-density");
    // Sync with the attribute the no-flash script already set before hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (d === "compact" || d === "comfy") setDensityState(d);
  }, []);

  const setDensity = (d: Density) => {
    setDensityState(d);
    document.documentElement.setAttribute("data-density", d);
    try {
      localStorage.setItem("jiroo-density", d);
    } catch {}
  };

  return (
    <DensityContext.Provider value={{ density, setDensity }}>{children}</DensityContext.Provider>
  );
}

export function useDensity() {
  const ctx = useContext(DensityContext);
  if (!ctx) throw new Error("useDensity must be used within DensityProvider");
  return ctx;
}
