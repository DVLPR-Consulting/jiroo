"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/theme-provider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const actionLabel = theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre";
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={actionLabel}>
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
