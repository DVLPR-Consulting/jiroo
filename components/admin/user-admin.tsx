"use client";

import { useState, useTransition } from "react";
import { setUserRoleAction } from "@/app/actions/users";
import { UserCreateDialog } from "@/components/admin/user-create-dialog";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { ROLE_LABELS } from "@/lib/items/users";
import type { Role } from "@/lib/auth/rbac";
import type { LabelHue } from "@/lib/design/constants";
import type { AdminUserRow } from "@/lib/services/users";

function hueFor(value: string): LabelHue {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return ((Math.abs(hash) % 6) + 1) as LabelHue;
}

export function UserAdmin({
  users,
  currentUserId,
}: {
  users: AdminUserRow[];
  currentUserId: string;
}) {
  const [roles, setRoles] = useState<Record<string, Role>>(() =>
    Object.fromEntries(users.map((user) => [user.id, user.role])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <UserCreateDialog />
      </div>
      {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border bg-card">
        {users.map((adminUser) => {
          const selectedRole = roles[adminUser.id] ?? adminUser.role;
          const isCurrentUser = adminUser.id === currentUserId;
          return (
            <li key={adminUser.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <InitialsAvatar name={adminUser.name} hue={hueFor(adminUser.id)} size={30} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{adminUser.name}</p>
                  {isCurrentUser && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Vous
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{adminUser.email}</p>
              </div>
              <select
                aria-label={`Rôle de ${adminUser.name}`}
                value={selectedRole}
                disabled={pending || isCurrentUser}
                onChange={(event) => {
                  const nextRole = event.target.value as Role;
                  const previousRole = selectedRole;
                  setError(null);
                  setRoles((current) => ({ ...current, [adminUser.id]: nextRole }));
                  startTransition(async () => {
                    const result = await setUserRoleAction({
                      userId: adminUser.id,
                      role: nextRole,
                    });
                    if (!result.ok) {
                      setRoles((current) => ({ ...current, [adminUser.id]: previousRole }));
                      setError(result.error);
                    }
                  });
                }}
                className="h-8 max-w-40 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {(Object.entries(ROLE_LABELS) as Array<[Role, string]>).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
        {users.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            Aucun utilisateur pour le moment.
          </li>
        )}
      </ul>
    </div>
  );
}
