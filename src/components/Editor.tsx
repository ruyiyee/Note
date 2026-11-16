import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor as TEditor } from '@tiptap/react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Folder, Note } from '../lib/types';
import { editorExtensions } from '../lib/extensions';
import { duplicateNote, saveNoteContent, trashNote, updateNote } from '../lib/store';
import { signedUrl, trashAttachment, uploadFile } from '../lib/attachments';
import { db } from '../lib/db';
import { download, noteToMarkdown } from '../lib/export';
import { docToText, extractWikiLinks, keywords } from '../lib/text';
import History from './History';
import StudyPanel from './StudyPanel';

interface Props { note: Note; notes: Note[]; folders: Folder[]; onBack: () => void; onOpen: (id: string) => void; searchTerms: string }

export default function Editor({ note, notes, folders, onBack, onOpen }: Props) {
  const [title, setTitle] = useState(note.title);
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<null | 'history' | 'study' | 'links'>(null);
  const [menu, setMenu] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const pendingDoc = useRef<unknown>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const attachments = useLiveQuery(() => db.attachments.where('note_id').equals(note.id).toArray(), [note.id], []);

  const flush = () => {
    clearTimeout(saveTimer.current);
    if (pendingDoc.current) { const d = pendingDoc.current; pendingDoc.current = null; saveNoteContent(note.id, d).finally(() => setSaving(false)); }
  };

  async function handleFiles(files: File[], editor: TEditor | null) {
    setErr(null);
    for (const f of files) {
      try {
        const a = await uploadFile(f, note.id);
        if (f.type.startsWith('image/') && editor) {
          const url = await signedUrl(a.path);
          editor.chain().focus().setImage({ src: url, alt: f.name, path: a.path } as any).run();
        }
      } catch (e: any) { setErr(e.message ?? String(e)); }
    }
  }

  const editor = useEditor({
    extensions: editorExtensions(),
    content: (note.content as any) ?? '',
    editorProps: {
      attributes: { class: 'prose', spellcheck: 'true' },
      handlePaste: (_v, e) => { const fs = [...(e.clipboardData?.files ?? [])]; if (fs.length) { handleFiles(fs, editorRef.current); return true; } return false; },
      handleDrop: (_v, e) => { const fs = [...((e as DragEvent).dataTransfer?.files ?? [])]; if (fs.length) { e.preventDefault(); handleFiles(fs, editorRef.current); return true; } return false; },
    },
    onUpdate: ({ editor }) => {
      pendingDoc.current = editor.getJSON(); setSaving(true);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, 600);
    },
    onBlur: flush,
  });
  const editorRef = useRef<TEditor | null>(null);
  editorRef.current = editor;

  useEffect(() => () => flush(), []);
  useEffect(() => { const f = () => flush(); window.addEventListener('beforeunload', f); window.addEventListener('pagehide', f); return () => { window.removeEventListener('beforeunload', f); window.removeEventListener('pagehide', f); }; }, []);

  // Apply changes that arrived from another device (only when not actively editing).
  useEffect(() => {
    if (!editor || note._dirty === 1 || pendingDoc.current || editor.isFocused) return;
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(note.content)) editor.commands.setContent((note.content as any) ?? '', { emitUpdate: false });
    if (document.activeElement?.className !== 'note-title') setTitle(note.title);
  }, [note.updated_at]);

  const titleTimer = useRef<ReturnType<typeof setTimeout>>();
  const onTitle = (v: string) => { setTitle(v); clearTimeout(titleTimer.current); titleTimer.current = setTimeout(() => updateNote(note.id, { title: v }), 400); };

  const suggestions = useMemo(() => keywords(`${note.title} ${note.content_text}`, 6).filter((k) => !note.tags.includes(k)).slice(0, 4), [note.content_text, note.title, note.tags]);
  const related = useMemo(() => relatedNotes(note, notes), [note.content_text, notes.length]);
  const links = useMemo(() => {
    const outT = extractWikiLinks(note.content_text).map((t) => t.toLowerCase());
    const live = notes.filter((n) => !n.deleted_at && n.id !== note.id);
    return {
      out: live.filter((n) => outT.includes((n.title || '').toLowerCase())),
      missing: outT.filter((t) => !live.some((n) => (n.title || '').toLowerCase() === t)),
      back: note.title ? live.filter((n) => extractWikiLinks(n.content_text).some((t) => t.toLowerCase() === note.title.toLowerCase())) : [],
    };
  }, [note.content_text, note.title, notes]);

  const addTag = (t: string) => { const tag = t.trim().replace(/^#/, '').toLowerCase(); if (tag && !note.tags.includes(tag)) updateNote(note.id, { tags: [...note.tags, tag] }); };
  const status = saving ? 'Saving…' : note._dirty === 1 ? 'Saved on this device · waiting to sync' : 'Saved to cloud';

  return (
    <main className="editor">
      <header className="editor-head">
        <button className="icon-btn mobile-only" onClick={() => { flush(); onBack(); }} aria-label="Back">‹</button>
        <span className={`save-state ${note._dirty === 1 || saving ? 'pending' : 'ok'}`} title={`Last edited ${new Date(note.updated_at).toLocaleString()}`}>{status}</span>
        <span className="grow" />
        <button className={`icon-btn ${note.pinned ? 'on' : ''}`} title="Pin" onClick={() => updateNote(note.id, { pinned: !note.pinned })}>📌</button>
        <button className={`icon-btn ${note.favorite ? 'on' : ''}`} title="Favourite" onClick={() => updateNote(note.id, { favorite: !note.favorite })}>★</button>
        <button className="icon-btn" title="Study: summary & flashcards" onClick={() => setPanel(panel === 'study' ? null : 'study')}>🎓</button>
        <button className="icon-btn" title="Links & related notes" onClick={() => setPanel(panel === 'links' ? null : 'links')}>🔗</button>
        <button className="icon-btn" title="Version history" onClick={() => { flush(); setPanel(panel === 'history' ? null : 'history'); }}>🕘</button>
        <div className="menu-wrap">
          <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label="More">⋯</button>
          {menu && (
            <div className="dropdown" onMouseLeave={() => setMenu(false)}>
              {note.deleted_at ? <button onClick={() => updateNote(note.id, { deleted_at: null })}>Restore from Trash</button> : <>
                <button onClick={async () => { flush(); const d = await duplicateNote(note.id); if (d) onOpen(d.id); setMenu(false); }}>Duplicate</button>
                <button onClick={() => { updateNote(note.id, { archived: !note.archived }); setMenu(false); }}>{note.archived ? 'Unarchive' : 'Archive'}</button>
                <button onClick={() => { updateNote(note.id, { inbox: !note.inbox }); setMenu(false); }}>{note.inbox ? 'Remove from Inbox' : 'Move to Inbox'}</button>
                <button onClick={() => { download(`${(note.title || 'note').replace(/[^\w\- ]+/g, '')}.md`, noteToMarkdown(note), 'text/markdown'); setMenu(false); }}>Export as Markdown</button>
                <button onClick={() => { window.print(); setMenu(false); }}>Print / Save as PDF</button>
                <button className="danger" onClick={() => { flush(); trashNote(note.id); setMenu(false); onBack(); }}>Move to Trash</button>
              </>}
            </div>
          )}
        </div>
      </header>

      <div className="editor-body">
        <div className="editor-scroll">
          <div className="doc">
            {note.deleted_at && <p className="banner">This note is in Trash. <button className="link" onClick={() => updateNote(note.id, { deleted_at: null })}>Restore</button></p>}
            <textarea className="note-title" rows={1} placeholder="Untitled" value={title} onChange={(e) => onTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editor?.commands.focus('start'); } }} />
            <div className="meta-row">
              <select value={note.folder_id ?? ''} onChange={(e) => updateNote(note.id, { folder_id: e.target.value || null })} aria-label="Folder">
                <option value="">No folder</option>
                {folderOptions(folders)}
              </select>
              {note.tags.map((t) => <span key={t} className="tag chip">#{t}<button aria-label={`Remove ${t}`} onClick={() => updateNote(note.id, { tags: note.tags.filter((x) => x !== t) })}>×</button></span>)}
              <input className="tag-input" placeholder="+ tag" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ''; } }} />
              {suggestions.length > 0 && <span className="suggest muted small">Suggested: {suggestions.map((s) => <button key={s} className="link" onClick={() => addTag(s)}>#{s}</button>)}</span>}
            </div>
            {editor && <Toolbar editor={editor} onAttach={() => fileInput.current?.click()} />}
            {err && <p className="error">{err}</p>}
            <EditorContent editor={editor} className="editor-content" />
            <input ref={fileInput} type="file" multiple hidden accept="image/*,application/pdf,.pdf,.txt,.doc,.docx,.xlsx,.pptx,.csv,.zip"
              onChange={(e) => { handleFiles([...(e.target.files ?? [])], editor); e.target.value = ''; }} />
            {attachments.filter((a) => !a.deleted_at).length > 0 && (
              <div className="attachments">
                <h4>Attachments</h4>
                {attachments.filter((a) => !a.deleted_at).map((a) => (
                  <div key={a.id} className="attachment">
                    <span>{a.mime === 'application/pdf' ? '📄' : a.mime.startsWith('image/') ? '🖼️' : '📎'}</span>
                    <button className="link grow" onClick={async () => { try { window.open(await signedUrl(a.path), '_blank', 'noopener'); } catch (e: any) { setErr(e.message); } }}>{a.name}</button>
                    <span className="muted small">{fmtSize(a.size)}</span>
                    <button className="icon-btn" title="Remove" onClick={() => confirm(`Remove ${a.name}?`) && trashAttachment(a.id)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {panel === 'history' && <History note={note} onClose={() => setPanel(null)} onRestore={(content, t) => { editor?.commands.setContent(content as any); saveNoteContent(note.id, content); updateNote(note.id, { title: t }); setTitle(t); setPanel(null); }} />}
        {panel === 'study' && <StudyPanel note={note} onClose={() => setPanel(null)} />}
        {panel === 'links' && (
          <aside className="side-panel">
            <header><h3>Connections</h3><button className="icon-btn" onClick={() => setPanel(null)}>×</button></header>
            <p className="muted small">Link notes by writing <code>[[Note title]]</code> anywhere in a note.</p>
            <h4>Links from this note</h4>
            {links.out.map((n) => <button key={n.id} className="link block-link" onClick={() => onOpen(n.id)}>{n.title}</button>)}
            {links.missing.map((t) => <div key={t} className="muted small">[[{t}]] (no note with this title)</div>)}
            {!links.out.length && !links.missing.length && <p className="muted small">None</p>}
            <h4>Backlinks</h4>
            {links.back.map((n) => <button key={n.id} className="link block-link" onClick={() => onOpen(n.id)}>{n.title || 'Untitled'}</button>)}
            {!links.back.length && <p className="muted small">None</p>}
            <h4>Related (shared keywords & tags)</h4>
            {related.map((n) => <button key={n.id} className="link block-link" onClick={() => onOpen(n.id)}>{n.title || 'Untitled'}</button>)}
            {!related.length && <p className="muted small">None yet</p>}
          </aside>
        )}
      </div>
    </main>
  );
}

function folderOptions(folders: Folder[], parent: string | null = null, depth = 0): JSX.Element[] {
  return folders.filter((f) => f.parent_id === parent).sort((a, b) => a.name.localeCompare(b.name)).flatMap((f) => [
    <option key={f.id} value={f.id}>{'  '.repeat(depth)}{f.icon || '📁'} {f.name}</option>,
    ...folderOptions(folders, f.id, depth + 1),
  ]);
}

const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

function relatedNotes(note: Note, notes: Note[]) {
  const kw = new Set(keywords(`${note.title} ${note.content_text}`, 12));
  return notes.filter((n) => n.id !== note.id && !n.deleted_at)
    .map((n) => {
      const k = keywords(`${n.title} ${n.content_text}`, 12);
      const s = k.filter((w) => kw.has(w)).length + n.tags.filter((t) => note.tags.includes(t)).length * 2 + (n.folder_id && n.folder_id === note.folder_id ? 1 : 0);
      return { n, s };
    }).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, 6).map((x) => x.n);
}

function Toolbar({ editor, onAttach }: { editor: TEditor; onAttach: () => void }) {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); editor.on('transaction', f); return () => { editor.off('transaction', f); }; }, [editor]);
  const c = () => editor.chain().focus();
  const B = ({ on, run, label, title }: { on?: boolean; run: () => void; label: React.ReactNode; title: string }) => (
    <button type="button" className={`tb ${on ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={run} title={title} aria-label={title}>{label}</button>
  );
  const inTable = editor.isActive('table');
  return (
    <div className="toolbar" role="toolbar">
      <B on={editor.isActive('heading', { level: 1 })} run={() => c().toggleHeading({ level: 1 }).run()} label="H1" title="Heading 1 (Ctrl/⌘ Alt 1)" />
      <B on={editor.isActive('heading', { level: 2 })} run={() => c().toggleHeading({ level: 2 }).run()} label="H2" title="Heading 2 (Ctrl/⌘ Alt 2)" />
      <B on={editor.isActive('heading', { level: 3 })} run={() => c().toggleHeading({ level: 3 }).run()} label="H3" title="Heading 3 (Ctrl/⌘ Alt 3)" />
      <span className="sep" />
      <B on={editor.isActive('bold')} run={() => c().toggleBold().run()} label={<b>B</b>} title="Bold (Ctrl/⌘ B)" />
      <B on={editor.isActive('italic')} run={() => c().toggleItalic().run()} label={<i>I</i>} title="Italic (Ctrl/⌘ I)" />
      <B on={editor.isActive('underline')} run={() => c().toggleUnderline().run()} label={<u>U</u>} title="Underline (Ctrl/⌘ U)" />
      <B on={editor.isActive('strike')} run={() => c().toggleStrike().run()} label={<s>S</s>} title="Strikethrough" />
      <B on={editor.isActive('highlight')} run={() => c().toggleHighlight().run()} label={<mark>H</mark>} title="Highlight (Ctrl/⌘ Shift H)" />
      <B on={editor.isActive('code')} run={() => c().toggleCode().run()} label="</>" title="Inline code" />
      <span className="sep" />
      <B on={editor.isActive('bulletList')} run={() => c().toggleBulletList().run()} label="•" title="Bullet list" />
      <B on={editor.isActive('orderedList')} run={() => c().toggleOrderedList().run()} label="1." title="Numbered list" />
      <B on={editor.isActive('taskList')} run={() => c().toggleTaskList().run()} label="☑" title="Checklist (add @YYYY-MM-DD for a deadline)" />
      <B on={editor.isActive('blockquote')} run={() => c().toggleBlockquote().run()} label="❝" title="Quote" />
      <B on={editor.isActive('codeBlock')} run={() => c().toggleCodeBlock().run()} label="{ }" title="Code block" />
      <span className="sep" />
      <B on={editor.isActive('link')} run={() => {
        if (editor.isActive('link')) return c().unsetLink().run();
        const url = prompt('Link URL'); if (url) c().extendMarkRange('link').setLink({ href: /^https?:|^mailto:/.test(url) ? url : `https://${url}` }).run();
      }} label="🔗" title="Link" />
      <B run={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} label="▦" title="Insert table" />
      {inTable && <>
        <B run={() => c().addRowAfter().run()} label="+row" title="Add row" />
        <B run={() => c().addColumnAfter().run()} label="+col" title="Add column" />
        <B run={() => c().deleteRow().run()} label="−row" title="Delete row" />
        <B run={() => c().deleteColumn().run()} label="−col" title="Delete column" />
        <B run={() => c().deleteTable().run()} label="✕▦" title="Delete table" />
      </>}
      <B run={onAttach} label="📎" title="Attach image or PDF" />
      <span className="sep" />
      <B run={() => c().undo().run()} label="↶" title="Undo (Ctrl/⌘ Z)" />
      <B run={() => c().redo().run()} label="↷" title="Redo (Ctrl/⌘ Shift Z)" />
    </div>
  );
}

export { docToText };
