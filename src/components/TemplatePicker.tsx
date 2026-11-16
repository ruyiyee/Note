import { TEMPLATES, type Template } from '../lib/templates';

export default function TemplatePicker({ onClose, onPick }: { onClose: () => void; onPick: (t: Template) => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New note">
        <header><h3>New note</h3><button className="icon-btn" onClick={onClose}>×</button></header>
        <div className="template-grid">
          {TEMPLATES.map((t, i) => <button key={t.id} className="template" autoFocus={i === 0} onClick={() => onPick(t)}>{t.name}</button>)}
        </div>
      </div>
    </div>
  );
}
