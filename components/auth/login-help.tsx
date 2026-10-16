"use client";

import { useState } from "react";

const helpItems = [
  {
    label: "Mot de passe oublié ?",
    message: "Contactez un administrateur Jiroo pour réinitialiser votre accès.",
  },
  {
    label: "Première connexion ?",
    message:
      "Connectez-vous avec le mot de passe transmis : la configuration 2FA vous sera proposée avant l’accès à l’application.",
  },
] as const;

export function LoginHelp() {
  const [expanded, setExpanded] = useState<boolean[]>([false, false]);

  return (
    <div className="mt-4 space-y-2 text-center">
      {helpItems.map((item, index) => {
        const contentId = `login-help-${index}`;
        const isExpanded = expanded[index];

        return (
          <div key={item.label}>
            <button
              type="button"
              className="t-sm text-muted-foreground underline-offset-4 hover:underline"
              aria-expanded={isExpanded}
              aria-controls={contentId}
              onClick={() =>
                setExpanded((current) =>
                  current.map((value, currentIndex) =>
                    currentIndex === index ? !value : value,
                  ),
                )
              }
            >
              {item.label}
            </button>
            {isExpanded ? (
              <p id={contentId} className="t-sm mt-1 text-muted-foreground">
                {item.message}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
