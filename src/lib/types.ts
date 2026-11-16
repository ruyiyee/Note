// Shared row types. Mirror supabase/migrations/*.sql.
// Folders: parent_id null = folder, parent_id set = notebook inside that folder.
// Local-only fields start with "_" and are stripped before upload.

export interface LocalMeta {
  _dirty?: 0 | 1; // 1 = has local changes not yet pushed
  _rev?: number;  // bumps on every local write; used to avoid clobbering edits during push
}

export interface Folder extends LocalMeta {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Note extends LocalMeta {
  id: string;
  user_id: string;
  folder_id: string | null;
  title: string;
  content: unknown | null; // TipTap JSON
  content_text: string;
  tags: string[];
  pinned: boolean;
  favorite: boolean;
  archived: boolean;
  inbox: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Attachment extends LocalMeta {
  id: string;
  user_id: string;
  note_id: string | null;
  path: string;
  name: string;
  mime: string;
  size: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Card extends LocalMeta {
  id: string;
  user_id: string;
  kind: 'vocab' | 'qa';
  deck: string;
  front: string;
  back: string;
  example: string;
  pronunciation: string;
  notes: string;
  source_note_id: string | null;
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  due_at: string;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Standalone task (kind 'task') or calendar entry (kind 'event'). Not linked to notes. */
export interface Item extends LocalMeta {
  id: string;
  user_id: string;
  kind: 'task' | 'event';
  title: string;
  date: string | null; // YYYY-MM-DD
  done: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface NoteVersion {
  id: string;
  note_id: string;
  title: string;
  content: unknown | null;
  content_text: string;
  created_at: string;
}

export type SyncedTable = 'folders' | 'notes' | 'attachments' | 'cards' | 'items';
export const SYNCED_TABLES: SyncedTable[] = ['folders', 'notes', 'attachments', 'cards', 'items'];
