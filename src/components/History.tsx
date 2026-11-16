import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Note, NoteVersion } from '../lib/types';

// Versions are snapshotted server-side (trigger) at most every 10 minutes while a note changes.
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
      <header><h3>Version history</h3><button className="icon-btn" onClick={onClose}>×</button></header>
      <p className="muted small">A snapshot is kept at most every 10 minutes while you edit.</p>
      {err && <p className="error">{err}</p>}
      {versions?.length === 0 && <p className="muted small">No earlier versions yet.</p>}
      {versions?.map((v) => (
        <button key={v.id} className={`version ${sel?.id === v.id ? 'active' : ''}`} onClick={() => setSel(v)}>
          <span>{new Date(v.created_at).toLocaleString()}</span><span className="muted small">{v.title || 'Untitled'}</span>
        </button>
      ))}
      {sel && (
        <div className="version-preview">
          <pre>{sel.content_text.slice(0, 2000) || '(empty)'}</pre>
          <button className="primary" onClick={() => confirm('Restore this version? The current text will itself be kept in history.') && onRestore(sel.content, sel.title)}>Restore this version</button>
        </div>
      )}
    </aside>
  );
}
