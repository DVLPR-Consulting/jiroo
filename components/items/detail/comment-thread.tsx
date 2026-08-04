"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CommentMarkdown } from "./comment-markdown";
import { CommentComposer } from "./comment-composer";
import { deleteCommentAction } from "@/app/actions/comments";
import type { CommentRow } from "@/lib/services/comments";

// Re-export the canonical row type so existing consumers (e.g. ItemDetailPanel)
// can keep importing it from here; the single source of truth lives in the service.
export type { CommentRow };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a date as a localised French absolute datetime string.
 * RSC preserves Date across the server→client boundary, so the canonical
 * CommentRow carries real Date objects; the string branch is a defensive
 * normalization in case a value is ever serialized as a string.
 */
function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// DeleteCommentDialog
// ---------------------------------------------------------------------------

function DeleteCommentDialog({
  open,
  onOpenChange,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer le commentaire ?</DialogTitle>
          <DialogDescription>
            Ce commentaire sera définitivement supprimé. Cette action est irréversible.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            Supprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Single comment row
// ---------------------------------------------------------------------------

function CommentItem({
  comment,
  itemId,
  backlogKey,
  users,
  isOwn,
  isEditing,
  canWrite,
  onEditStart,
  onEditDone,
}: {
  comment: CommentRow;
  itemId: string;
  backlogKey: string;
  users: { id: string; name: string }[];
  isOwn: boolean;
  isEditing: boolean;
  canWrite: boolean;
  onEditStart: () => void;
  onEditDone: () => void;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setDeleteError(null);
    startTransition(async () => {
      const res = await deleteCommentAction({ backlogKey, id: comment.id });
      if (!res.ok) {
        setDeleteError(res.error);
        return;
      }
      setDeleteOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Header row: author + date + edited marker + actions */}
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-foreground">
          {comment.authorName}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDate(comment.createdAt)}
        </span>
        {comment.editedAt && !comment.deleted && (
          <span className="text-xs text-muted-foreground">· modifié</span>
        )}

        {/* Own comment affordances (always visible, not hover-only for accessibility) */}
        {canWrite && isOwn && !comment.deleted && (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={onEditStart}
              disabled={isEditing}
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground disabled:opacity-50"
            >
              Modifier
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground"
            >
              Supprimer
            </button>
          </div>
        )}
      </div>

      {/* Body: tombstone, inline editor, or rendered markdown */}
      {comment.deleted ? (
        <p className="text-sm italic text-muted-foreground">
          Commentaire supprimé
        </p>
      ) : canWrite && isEditing ? (
        <CommentComposer
          itemId={itemId}
          backlogKey={backlogKey}
          users={users}
          mode="edit"
          commentId={comment.id}
          initialBody={comment.body}
          initialMentionIds={comment.mentions}
          onDone={onEditDone}
        />
      ) : (
        <CommentMarkdown
          body={comment.body}
          mentionNames={comment.mentions.flatMap((mentionId) => {
            const mentionedUser = users.find((user) => user.id === mentionId);
            return mentionedUser ? [mentionedUser.name] : [];
          })}
        />
      )}

      {/* Delete confirm dialog */}
      {canWrite && (
        <DeleteCommentDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          pending={pending}
          error={deleteError}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommentThread
// ---------------------------------------------------------------------------

export function CommentThread({
  itemId,
  backlogKey,
  comments,
  users,
  currentUserId,
  canWrite = true,
}: {
  itemId: string;
  backlogKey: string;
  comments: CommentRow[];
  users: { id: string; name: string }[];
  currentUserId: string;
  canWrite?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {/* Comment list (or empty state) */}
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun commentaire.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              itemId={itemId}
              backlogKey={backlogKey}
              users={users}
              isOwn={c.authorId === currentUserId}
              isEditing={editingId === c.id}
              canWrite={canWrite}
              onEditStart={() => setEditingId(c.id)}
              onEditDone={() => setEditingId(null)}
            />
          ))}
        </div>
      )}

      {/* New comment composer — pinned at the bottom */}
      {canWrite && (
        <div className="border-t border-border pt-4">
          <CommentComposer
            itemId={itemId}
            backlogKey={backlogKey}
            users={users}
            mode="create"
          />
        </div>
      )}
    </div>
  );
}
