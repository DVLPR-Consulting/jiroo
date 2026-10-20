import "dotenv/config";
import { BootstrapAdminError, bootstrapAdministrator } from "@/lib/services/bootstrap-admin";

/**
 * Creates the first Jiroo administrator of an installation (JIR-115):
 *   JIROO_ADMIN_EMAIL=… JIROO_ADMIN_NAME=… JIROO_ADMIN_PASSWORD=… pnpm db:bootstrap-admin
 * Pass the variables for this run only; never keep them in the application's
 * environment. Nothing else is created: no demonstration backlog or item.
 */
async function main() {
  const email = process.env.JIROO_ADMIN_EMAIL;
  const password = process.env.JIROO_ADMIN_PASSWORD;
  const name = process.env.JIROO_ADMIN_NAME ?? "Administrateur";
  if (!email || !password) {
    throw new BootstrapAdminError("Renseignez JIROO_ADMIN_EMAIL et JIROO_ADMIN_PASSWORD (et JIROO_ADMIN_NAME).");
  }
  const { outcome } = await bootstrapAdministrator({ email, name, password });
  console.log(
    outcome === "created"
      ? `Administrateur ${email} créé : la double authentification lui sera demandée à la première connexion.`
      : `${email} est déjà administrateur Jiroo : rien à créer.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    // The reason only: never the password nor the connection string.
    console.error(error instanceof BootstrapAdminError ? error.message : error);
    process.exit(1);
  });
