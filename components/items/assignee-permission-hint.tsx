/** Explains why the assignment picker cannot offer the user directory. */
export function AssigneePermissionHint({ id }: { id?: string }) {
  return (
    <p id={id} className="max-w-80 px-2 py-1.5 text-xs text-muted-foreground whitespace-normal">
      Il vous manque la permission globale « Parcourir les utilisateurs ». Demandez-la à un administrateur Jiroo.
    </p>
  );
}
