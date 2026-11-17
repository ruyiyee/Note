// Per-device preferences (stored in this browser only).
import { useEffect, useState } from 'react';

const KEY = 'spellcheck';
const listeners = new Set<(v: boolean) => void>();

/** Browser spelling and grammar underlines in the editor. On by default. */
export function getSpellcheck(): boolean { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } }
export function setSpellcheck(on: boolean) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
  listeners.forEach((l) => l(on));
}
export function useSpellcheck(): boolean {
  const [v, setV] = useState(getSpellcheck());
  useEffect(() => { listeners.add(setV); return () => { listeners.delete(setV); }; }, []);
  return v;
}

/** Attributes that turn spelling/grammar checking (browser, Grammarly, mobile autocorrect) on or off. */
export const checkAttrs = (on: boolean): Record<string, string> => ({
  spellcheck: on ? 'true' : 'false',
  autocorrect: on ? 'on' : 'off',
  autocapitalize: on ? 'sentences' : 'off',
  'data-gramm': on ? 'true' : 'false',
  'data-gramm_editor': on ? 'true' : 'false',
  'data-enable-grammarly': on ? 'true' : 'false',
});
