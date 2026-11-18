import { useEffect, useRef, useState } from 'react';
import WordCount from './WordCount';
import { EditorContent, useEditor, type Editor as TEditor } from '@tiptap/react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Folder, Note } from '../lib/types';
import { editorExtensions, HIGHLIGHTS } from '../lib/extensions';
import { duplicateNote, restoreNote, saveNoteContent, trashNote, updateNote } from '../lib/store';
import { removeAttachment, signedUrl, uploadFile } from '../lib/attachments';
import { db } from '../lib/db';
import { printNotes } from '../lib/export';
import { askConfirm } from './Dialog';
import { pageCount } from '../lib/pages';
import { checkAttrs, useSpellcheck } from '../lib/prefs';
import { beforeEdit } from '../lib/versions';
import History from './History';

interface Props { note: Note; folders: Folder[]; onBack: () => void; onClose: () => void; onOpen: (id: string) => void; wide: boolean; onToggleWide: () => void }

export default function Editor({ note, folders, onBack, onClose, onOpen, wide, onToggleWide }: Props) {
  const [title, setTitle] = useState(note.title);
  const spell = useSpellcheck();
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<null | 'history'>(null);
  const [menu, setMenu] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const pendingDoc = useRef<unknown>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const attachments = useLiveQuery(() => db.attachments.where('note_id').equals(note.id).toArray(), [note.id], []);
  // Images live inside the note itself, so only other files (PDFs) are listed under the note.
  const files = attachments.filter((a) => !a.deleted_at && !a.mime.startsWith('image/'));

  const pendingTitle = useRef<string | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout>>();
  /** Save anything typed but not yet saved (content and title). */
  const flush = () => {
    clearTimeout(saveTimer.current); clearTimeout(titleTimer.current);
    if (pendingDoc.current) { const d = pendingDoc.current; pendingDoc.current = null; saveNoteContent(note.id, d).finally(() => setSaving(false)); }
    if (pendingTitle.current !== null) { const t = pendingTitle.current; pendingTitle.current = null; updateNote(note.id, { title: t }); }
  };

  async function handleFiles(list: File[], editor: TEditor | null, at?: number) {
    setErr(null);
    for (const f of list) {
      try {
        const a = await uploadFile(f, note.id);
        if (f.type.startsWith('image/') && editor) {
          const img = { type: 'image', attrs: { src: '', alt: f.name, path: a.path } };
          if (at !== undefined && at <= editor.state.doc.content.size) { editor.chain().focus().insertContentAt(at, img).run(); at = undefined; }
          else editor.chain().focus().insertContent(img).run();
        }
      } catch (e: any) { setErr(e.message ?? String(e)); }
    }
  }

  const editorRef = useRef<TEditor | null>(null);
  const editor = useEditor({
    extensions: editorExtensions(),
    content: (note.content as any) ?? '',
    editorProps: {
      attributes: { class: 'prose', ...checkAttrs(spell) },
      handlePaste: (_v, e) => { const fs = [...(e.clipboardData?.files ?? [])]; if (fs.length) { handleFiles(fs, editorRef.current); return true; } return false; },
      // Dropped files go exactly where they are dropped. Dragging an image already in the note moves it.
      handleDrop: (v, e) => { const de = e as DragEvent; const fs = [...(de.dataTransfer?.files ?? [])]; if (fs.length) { e.preventDefault(); handleFiles(fs, editorRef.current, v.posAtCoords({ left: de.clientX, top: de.clientY })?.pos); return true; } return false; },
    },
    onUpdate: ({ editor }) => {
      pendingDoc.current = editor.getJSON(); setSaving(true);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, 600);
    },
    onBlur: flush,
  });
  editorRef.current = editor;

  // Apply the spelling/grammar preference when it changes.
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({ editorProps: { ...editor.options.editorProps, attributes: { class: 'prose', ...checkAttrs(spell) } } });
    const el = editor.view.dom as HTMLElement;
    for (const [k, v] of Object.entries(checkAttrs(spell))) el.setAttribute(k, v);
  }, [editor, spell]);

  useEffect(() => () => flush(), []);
  useEffect(() => { const f = () => flush(); window.addEventListener('beforeunload', f); window.addEventListener('pagehide', f); return () => { window.removeEventListener('beforeunload', f); window.removeEventListener('pagehide', f); }; }, []);

  // Apply changes that arrived from another device (only when not actively editing).
  useEffect(() => {
    if (!editor || note._dirty === 1 || pendingDoc.current || editor.isFocused) return;
    if (document.activeElement?.className !== 'note-title') setTitle(note.title);
    // Compare ignoring key order (the database returns JSON keys sorted), so our own
    // saved content coming back from the server never resets the editor.
    if (sameJSON(editor.getJSON(), note.content)) return;
    // A real change from another device: apply it but keep the cursor where it was.
    const { from, to } = editor.state.selection;
    editor.commands.setContent((note.content as any) ?? '', { emitUpdate: false });
    const max = editor.state.doc.content.size;
    try { editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) }); } catch { /* ignore */ }
  }, [note.updated_at]);

  const onTitle = (v: string) => { setTitle(v); pendingTitle.current = v; clearTimeout(titleTimer.current); titleTimer.current = setTimeout(flush, 400); };

  const pages = pageCount(note.content);
  const scrollRef = useRef<HTMLDivElement>(null);
  const goToPage = (n: number) => {
    const root = scrollRef.current; if (!root) return;
    if (n <= 1) return root.scrollTo({ top: 0, behavior: 'smooth' });
    const el = root.querySelectorAll('.ProseMirror > .page-break')[n - 2] as HTMLElement | undefined;
    if (el) root.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' });
  };

  const status = saving ? 'Saving' : note._dirty === 1 ? 'Saved on this device, waiting to sync' : 'Saved';
  const item = (label: string, run: () => void, cls = '') => <button className={cls} onClick={() => { setMenu(false); run(); }}>{label}</button>;

  return (
    <main className="editor">
      <header className="editor-head">
        <button className="text-btn mobile-only" onClick={() => { flush(); onBack(); }}>Back</button>
        <span className={`save-state ${note._dirty === 1 || saving ? 'pending' : ''}`} title={`Last edited ${new Date(note.updated_at).toLocaleString()}`}>{status}</span>
        <span className="grow" />
        {pages > 1 && <PageJump pages={pages} onGo={goToPage} />}
        <button className="text-btn desktop-only" onClick={onToggleWide} title="Ctrl/⌘ Shift E">{wide ? 'Exit full width' : 'Full width'}</button>
        <button className="text-btn desktop-only" onClick={() => { flush(); onClose(); }}>Close</button>
        {!note.deleted_at && <button className={`text-btn ${note.favorite ? 'on' : ''}`} onClick={() => updateNote(note.id, { favorite: !note.favorite })}>{note.favorite ? 'Favourited' : 'Favourite'}</button>}
        <div className="menu-wrap">
          <button className="text-btn" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}>More</button>
          {menu && (
            <div className="dropdown" role="menu" onMouseLeave={() => setMenu(false)}>
              {note.deleted_at ? item('Restore from Trash', () => restoreNote(note.id)) : <>
                {item('Version history', () => { flush(); setPanel('history'); })}
                {item('Duplicate', async () => { flush(); const d = await duplicateNote(note.id); if (d) onOpen(d.id); })}
                {item('Export PDF', () => { flush(); setTimeout(async () => { const n = await db.notes.get(note.id); if (n) printNotes(null, [n]); }, 50); })}
                {item('Move to Trash', () => { flush(); trashNote(note.id); onClose(); }, 'danger')}
              </>}
            </div>
          )}
        </div>
      </header>

      <div className="editor-body">
        <div className="editor-scroll" ref={scrollRef}>
          <div className="doc">
            {note.deleted_at && <p className="banner">This note is in Trash. <button className="text-btn on" onClick={() => restoreNote(note.id)}>Restore</button></p>}
            <textarea className="note-title" rows={1} {...(checkAttrs(spell) as any)} placeholder="Untitled" value={title} onChange={(e) => onTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editor?.commands.focus('start'); } }} />
            <div className="meta-row">
              <select value={note.folder_id ?? ''} onChange={(e) => updateNote(note.id, { folder_id: e.target.value || null })} aria-label="Notebook">
                <option value="">No notebook</option>
                {folders.filter((f) => !f.parent_id).sort((a, b) => a.name.localeCompare(b.name)).map((f) => (
                  <optgroup key={f.id} label={f.name}>
                    {folders.filter((n) => n.parent_id === f.id).sort((a, b) => a.name.localeCompare(b.name)).map((nb) => <option key={nb.id} value={nb.id}>{nb.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            {editor && !note.deleted_at && <Toolbar editor={editor} onAttach={() => fileInput.current?.click()} />}
            {err && <p className="error">{err}</p>}
            <EditorContent editor={editor} className="editor-content" />
            <input ref={fileInput} type="file" multiple hidden accept="image/*,application/pdf,.pdf"
              onChange={(e) => { handleFiles([...(e.target.files ?? [])], editor); e.target.value = ''; }} />
            {files.length > 0 && (
              <div className="attachments">
                <h4>Files</h4>
                {files.map((a) => (
                  <div key={a.id} className="attachment">
                    <button className="text-btn on grow" onClick={async () => { try { window.open(await signedUrl(a.path), '_blank', 'noopener'); } catch (e: any) { setErr(e.message); } }}>{a.name}</button>
                    <span className="muted small">{fmtSize(a.size)}</span>
                    <button className="text-btn" onClick={async () => { if (await askConfirm(`Remove ${a.name}?`, 'Remove')) removeAttachment(a).catch((e) => setErr(e.message ?? String(e))); }}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {panel === 'history' && <History note={note} onClose={() => setPanel(null)} onRestore={async (content, t) => { flush(); await beforeEdit(note.id, true); editor?.commands.setContent(content as any, { emitUpdate: false }); await saveNoteContent(note.id, content); updateNote(note.id, { title: t }); setTitle(t); setPanel(null); }} />}
      </div>
      {editor && <WordCount editor={editor} />}
    </main>
  );
}

/** "Go to page" control: type or pick a page number. */
function PageJump({ pages, onGo }: { pages: number; onGo: (n: number) => void }) {
  const [v, setV] = useState('');
  return (
    <form className="page-jump" onSubmit={(e) => { e.preventDefault(); const n = Math.min(pages, Math.max(1, parseInt(v, 10) || 1)); onGo(n); setV(''); }}>
      <label className="muted small" htmlFor="page-jump">Page</label>
      <input id="page-jump" inputMode="numeric" placeholder={`1–${pages}`} value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} aria-label={`Go to page, 1 to ${pages}`} />
    </form>
  );
}

/** Deep equality for JSON values, ignoring object key order. */
function sameJSON(a: unknown, b: unknown): boolean {
  const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o: any, k) => { if (v[k] !== undefined) o[k] = canon(v[k]); return o; }, {}) : v;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

function Toolbar({ editor, onAttach }: { editor: TEditor; onAttach: () => void }) {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); editor.on('transaction', f); return () => { editor.off('transaction', f); }; }, [editor]);
  const c = () => editor.chain().focus();
  const B = ({ on, run, label, title }: { on?: boolean; run: () => void; label: React.ReactNode; title?: string }) => (
    <button type="button" className={`tb ${on ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={run} title={title} aria-label={title} aria-pressed={on}>{label}</button>
  );
  const heading = editor.isActive('heading', { level: 1 }) ? '1' : editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : '0';
  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <select className="tb-select" value={heading} aria-label="Text style"
        onChange={(e) => { const l = Number(e.target.value); l ? c().setHeading({ level: l as 1 | 2 | 3 }).run() : c().setParagraph().run(); }}>
        <option value="0">Text</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option>
      </select>
      <B on={editor.isActive('bold')} run={() => c().toggleBold().run()} label={<b>B</b>} title="Bold" />
      <B on={editor.isActive('italic')} run={() => c().toggleItalic().run()} label={<i>I</i>} title="Italic" />
      <B on={editor.isActive('underline')} run={() => c().toggleUnderline().run()} label={<u>U</u>} title="Underline" />
      <span className="swatches" role="group" aria-label="Highlight">
        {HIGHLIGHTS.map((color, i) => (
          <button key={color} type="button" className={`swatch ${editor.isActive('highlight', { color }) ? 'on' : ''}`} style={{ background: color }}
            onMouseDown={(e) => e.preventDefault()} onClick={() => c().toggleHighlight({ color }).run()} title={`Highlight ${i + 1}`} aria-label={`Highlight ${i + 1}`} />
        ))}
      </span>
      <B on={editor.isActive('bulletList')} run={() => c().toggleBulletList().run()} label="Bullets" />
      <B on={editor.isActive('orderedList')} run={() => c().toggleOrderedList().run()} label="Numbers" />
      <B on={editor.isActive('taskList')} run={() => c().toggleTaskList().run()} label="Checklist" />
      {editor.isActive('table') ? <>
        <B run={() => c().addRowAfter().run()} label="Add row" />
        <B run={() => c().addColumnAfter().run()} label="Add column" />
        <B run={() => c().deleteRow().run()} label="Delete row" />
        <B run={() => c().deleteColumn().run()} label="Delete column" />
        <B run={() => c().deleteTable().run()} label="Delete table" />
      </> : <B run={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} label="Table" />}
      <B run={() => c().insertContent([{ type: 'drawing' }, { type: 'paragraph' }]).run()} label="Draw" title="Add a drawing area" />
      <B run={() => c().insertPageBreak().run()} label="New page" title="Start a new page below" />
      <B run={onAttach} label="Attach" title="Attach an image or PDF" />
    </div>
  );
}
