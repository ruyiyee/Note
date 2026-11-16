// Small in-app replacements for prompt() and confirm().
import { useEffect, useState } from 'react';

type Req =
  | { kind: 'text'; title: string; initial: string; ok: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; ok: string; resolve: (v: boolean) => void };

let open: (r: Req) => void = () => {};

export const askText = (title: string, initial = '', ok = 'Save') => new Promise<string | null>((resolve) => open({ kind: 'text', title, initial, ok, resolve }));
export const askConfirm = (title: string, ok = 'Confirm') => new Promise<boolean>((resolve) => open({ kind: 'confirm', title, ok, resolve }));

export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [val, setVal] = useState('');
  useEffect(() => { open = (r) => { setVal(r.kind === 'text' ? r.initial : ''); setReq(r); }; }, []);
  if (!req) return null;
  const cancel = () => { req.kind === 'text' ? req.resolve(null) : req.resolve(false); setReq(null); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (req.kind === 'text') { if (!val.trim()) return; req.resolve(val.trim()); } else req.resolve(true);
    setReq(null);
  };
  return (
    <div className="modal-backdrop" onClick={cancel}>
      <form className="modal dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-label={req.title}>
        <p className="dialog-title">{req.title}</p>
        {req.kind === 'text' && <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && cancel()} />}
        <div className="row gap end">
          <button type="button" className="ghost" onClick={cancel}>Cancel</button>
          <button className="primary" autoFocus={req.kind === 'confirm'}>{req.ok}</button>
        </div>
      </form>
    </div>
  );
}
