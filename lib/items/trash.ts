const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function restoreDeadline(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + RESTORE_WINDOW_MS);
}

export function canRestore(deletedAt: Date, now: Date): boolean {
  return now.getTime() <= restoreDeadline(deletedAt).getTime();
}
