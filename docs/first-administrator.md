# First administrator

A new installation has no account. Create its first Jiroo administrator once, after the migrations (JIR-115):

```sh
JIROO_ADMIN_EMAIL=prenom.nom@example.org \
JIROO_ADMIN_NAME="Prénom Nom" \
JIROO_ADMIN_PASSWORD='…' \
pnpm db:bootstrap-admin
```

- Pass these variables for this command only; never keep them in the application's environment. The password is not printed.
- It needs the application's `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`, as the account is created through Better Auth.
- Nothing else is created: unlike `pnpm db:seed` (development only), no demonstration backlog or item.
- The administrator enrols two-factor authentication at the first sign-in, then creates the other accounts and backlogs from the administration screen.
- Running it again for the same administrator changes nothing. It refuses to create a second administrator, and never modifies an existing account or its password.
