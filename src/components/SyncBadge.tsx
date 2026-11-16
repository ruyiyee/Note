import { useEffect, useState } from 'react';
import { getStatus, onStatus, syncNow } from '../lib/sync';
import { supabaseRemote } from '../lib/remote';

export default function SyncBadge() {
  const [s, setS] = useState(getStatus());
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => onStatus(setS), []);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  let label = 'Synced', cls = 'ok';
  if (!online || s.state === 'offline') { label = s.pending ? `Offline · ${s.pending} unsynced` : 'Offline'; cls = 'warn'; }
  else if (s.state === 'syncing') { label = 'Syncing…'; cls = 'busy'; }
  else if (s.state === 'error') { label = 'Sync error · retry'; cls = 'err'; }
  else if (s.pending) { label = `Saving ${s.pending}…`; cls = 'busy'; }
  const title = s.error ? `Error: ${s.error}` : s.lastSyncedAt ? `Last synced ${new Date(s.lastSyncedAt).toLocaleTimeString()}` : 'Not synced yet';
  return <button className={`sync-badge ${cls}`} title={title} onClick={() => syncNow(supabaseRemote)}><span className="dot" />{label}</button>;
}
