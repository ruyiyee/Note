import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from './lib/supabase';
import { clearLocal, getMeta, setMeta } from './lib/db';
import { setCurrentUser } from './lib/store';
import Auth from './components/Auth';
import Workspace from './components/Workspace';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Make sure the local cache belongs to the signed-in user.
  useEffect(() => {
    if (!session) { setReady(false); return; }
    (async () => {
      const owner = await getMeta<string>('owner');
      if (owner && owner !== session.user.id) await clearLocal();
      await setMeta('owner', session.user.id);
      setCurrentUser(session.user.id);
      setReady(true);
    })();
  }, [session?.user.id]);

  if (!isConfigured) return (
    <div className="center-screen"><div className="card narrow">
      <h1>Setup needed</h1>
      <p>This build has no Supabase project configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.production</code> (see README).</p>
    </div></div>
  );
  if (session === undefined) return <div className="center-screen muted">Loading…</div>;
  if (!session) return <Auth />;
  if (!ready) return <div className="center-screen muted">Opening your notes…</div>;
  return <Workspace session={session} />;
}
