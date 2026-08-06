"use client";

import { UserCreateDialog } from "@/components/admin/user-create-dialog";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import type { LabelHue } from "@/lib/design/constants";
export type UserAdminDto = { id: string; name: string; email: string };

function hueFor(value: string): LabelHue {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return ((Math.abs(hash) % 6) + 1) as LabelHue;
}

export function UserAdmin({
  users,
  currentUserId,
}: {
  users: UserAdminDto[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <UserCreateDialog />
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border bg-card">
        {users.map((adminUser) => {
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
              <span className="text-xs text-muted-foreground">Accès attribué par groupes et rôles de backlog</span>
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
