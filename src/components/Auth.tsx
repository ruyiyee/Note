import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const redirect = window.location.origin + window.location.pathname;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); setMsg(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        if (!data.session) setMsg('Check your email to confirm your account, then sign in.');
      } else if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } });
        if (error) throw error;
        setMsg('Check your email for a sign-in link.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect });
        if (error) throw error;
        setMsg('Check your email for a password reset link.');
      }
    } catch (e: any) { setErr(e.message ?? String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="center-screen">
      <form className="card narrow auth" onSubmit={submit}>
        <div className="brand"><img src="icon.svg" alt="" width={36} height={36} /> <span>Notes</span></div>
        <h1>{{ signin: 'Sign in', signup: 'Create account', magic: 'Email me a link', reset: 'Reset password' }[mode]}</h1>
        <label>Email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {(mode === 'signin' || mode === 'signup') && (
          <label>Password<input type="password" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        )}
        {err && <p className="error">{err}</p>}
        {msg && <p className="ok">{msg}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Please wait…' : 'Continue'}</button>
        <div className="auth-links">
          {mode !== 'signin' && <button type="button" className="link" onClick={() => setMode('signin')}>Sign in with password</button>}
          {mode !== 'signup' && <button type="button" className="link" onClick={() => setMode('signup')}>Create an account</button>}
          {mode !== 'magic' && <button type="button" className="link" onClick={() => setMode('magic')}>Email me a sign-in link</button>}
          {mode !== 'reset' && <button type="button" className="link" onClick={() => setMode('reset')}>Forgot password</button>}
        </div>
      </form>
    </div>
  );
}
