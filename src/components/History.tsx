import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Note, NoteVersion } from '../lib/types';
import { askConfirm } from './Dialog';
import { SESSION } from '../lib/versions';

// Snapshots are taken by the app (src/lib/versions.ts): every 30 minutes while editing,
// and one per earlier visit.
export default function History({ note, onClose, onRestore }: { note: Note; onClose: () => void; onRestore: (content: unknown, title: string) => void }) {
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<NoteVersion | null>(null);
  useEffect(() => {
    supabase.from('note_versions').select('*').eq('note_id', note.id).order('created_at', { ascending: false }).limit(100)
      .then(({ data, error }) => { if (error) setErr(navigator.onLine ? error.message : 'Version history needs a connection.'); else setVersions(data as NoteVersion[]); });
  }, [note.id]);
  return (
    <aside className="side-panel">
      <header><h3>Version history</h3><button className="text-btn" onClick={onClose}>Close</button></header>
      <p className="muted small">While you edit, a version is saved every 30 minutes. From earlier visits, only the last version of each visit is kept.</p>
      {err && <p className="error">{err}</p>}
      {versions?.length === 0 && <p className="muted small">No earlier versions yet.</p>}
      {versions?.map((v) => (
        <button key={v.id} className={`version ${sel?.id === v.id ? 'active' : ''}`} onClick={() => setSel(v)}>
          <span>{new Date(v.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span><span className="muted small">{(v as any).session_id === SESSION ? 'This visit' : 'Earlier visit'}{v.title ? `, ${v.title}` : ''}</span>
        </button>
      ))}
      {sel && (
        <div className="version-preview">
          <pre>{sel.content_text.slice(0, 2000) || '(empty)'}</pre>
          <button className="primary" onClick={async () => (await askConfirm('Restore this version? The current text is kept in history too.', 'Restore')) && onRestore(sel.content, sel.title)}>Restore this version</button>
        </div>
      )}
    </aside>
  );
}
