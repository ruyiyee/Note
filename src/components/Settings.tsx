import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { applyTheme, getTheme, type Theme } from '../lib/theme';
import { exportJSON, exportMarkdown } from '../lib/export';
import { clearLocal } from '../lib/db';
import { deleteAllFiles } from '../lib/attachments';
import { countPending, syncNow } from '../lib/sync';
import { supabaseRemote } from '../lib/remote';

export default function Settings({ onClose, session }: { onClose: () => void; session: Session }) {
  const [theme, setTheme] = useState<Theme>(getTheme());
  const [msg, setMsg] = useState<string | null>(null);
  const [pw, setPw] = useState('');

  async function signOut() {
    const pending = await countPending();
    if (pending && !confirm(`${pending} change(s) have not synced yet and will be lost if you sign out now. Sign out anyway?`)) return;
    await clearLocal(); await supabase.auth.signOut(); location.reload();
  }

  async function deleteAccount() {
    const typed = prompt('This permanently deletes your account, all notes, cards and files. Type DELETE to confirm.');
    if (typed !== 'DELETE') return;
    try {
      setMsg('Deleting files…'); await deleteAllFiles();
      setMsg('Deleting account…');
      const { error } = await supabase.rpc('delete_my_account'); if (error) throw error;
      await clearLocal(); await supabase.auth.signOut(); location.reload();
    } catch (e: any) { setMsg('Account deletion failed: ' + (e.message ?? e)); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <header><h3>Settings</h3><button className="icon-btn" onClick={onClose}>×</button></header>
        <section>
          <h4>Appearance</h4>
          <div className="seg">{(['system', 'light', 'dark'] as Theme[]).map((t) => <button key={t} className={theme === t ? 'active' : ''} onClick={() => { setTheme(t); applyTheme(t); }}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div>
        </section>
        <section>
          <h4>Account</h4>
          <p className="small">Signed in as <strong>{session.user.email}</strong></p>
          <form className="row gap" onSubmit={async (e) => { e.preventDefault(); const { error } = await supabase.auth.updateUser({ password: pw }); setMsg(error ? error.message : 'Password updated.'); setPw(''); }}>
            <input type="password" placeholder="New password (8+ characters)" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required />
            <button className="ghost">Change password</button>
          </form>
          <button className="ghost" onClick={signOut}>Sign out</button>
        </section>
        <section>
          <h4>Your data</h4>
          <p className="muted small">Notes are stored in your Supabase database and kept on this device for offline use.</p>
          <div className="row gap wrap">
            <button className="ghost" onClick={async () => { await syncNow(supabaseRemote); await exportJSON(); }}>Export everything (JSON)</button>
            <button className="ghost" onClick={async () => { await syncNow(supabaseRemote); await exportMarkdown(); }}>Export notes (Markdown)</button>
          </div>
        </section>
        <section>
          <h4>Keyboard shortcuts</h4>
          <table className="shortcuts"><tbody>
            <tr><td><kbd>Ctrl/⌘ Alt N</kbd></td><td>New note</td></tr>
            <tr><td><kbd>Ctrl/⌘ Shift I</kbd></td><td>Quick capture to Inbox</td></tr>
            <tr><td><kbd>Ctrl/⌘ K</kbd></td><td>Search</td></tr>
            <tr><td><kbd>Ctrl/⌘ \</kbd></td><td>Toggle sidebar</td></tr>
            <tr><td><kbd>Ctrl/⌘ S</kbd></td><td>Sync now</td></tr>
            <tr><td><kbd>Ctrl/⌘ B / I / U</kbd></td><td>Bold / italic / underline</td></tr>
            <tr><td><kbd>Ctrl/⌘ Shift H</kbd></td><td>Highlight</td></tr>
            <tr><td><kbd>Ctrl/⌘ Alt 1–3</kbd></td><td>Headings</td></tr>
            <tr><td><kbd>Ctrl/⌘ Shift 7 / 8 / 9</kbd></td><td>Numbered / bullet / checklist</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Back to list (mobile)</td></tr>
          </tbody></table>
        </section>
        <section>
          <h4 className="error">Danger zone</h4>
          <button className="danger-btn" onClick={deleteAccount}>Delete account and all data</button>
        </section>
        {msg && <p className="small">{msg}</p>}
      </div>
    </div>
  );
}
