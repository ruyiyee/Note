// Supabase implementation of the sync Remote + realtime subscription.
import { supabase } from './supabase';
import { SYNCED_TABLES, type SyncedTable } from './types';
import type { Remote } from './sync';

export const supabaseRemote: Remote = {
  async upsert(table, rows) {
    const { data, error } = await supabase.from(table).upsert(rows, { onConflict: 'id' }).select();
    if (error) throw error;
    return data ?? [];
  },
  async pullSince(table, since, limit) {
    let q = supabase.from(table).select('*').order('updated_at', { ascending: true }).limit(limit);
    if (since) q = q.gt('updated_at', since);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
};

/** Subscribe to row changes on all synced tables; calls onChange (debounce it upstream). */
export function subscribeRealtime(userId: string, onChange: (t: SyncedTable) => void) {
  const ch = supabase.channel(`sync-${userId}`);
  for (const t of SYNCED_TABLES) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `user_id=eq.${userId}` }, () => onChange(t));
  }
  ch.subscribe();
  return () => { supabase.removeChannel(ch); };
}
