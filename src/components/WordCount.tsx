import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { countWords } from '../lib/text';

const plural = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'word' : 'words'}`;

// Small, quiet counter under the note. Shows the selection's count while text is selected.
export default function WordCount({ editor }: { editor: Editor }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const { state } = editor;
        const total = countWords(state.doc.textBetween(0, state.doc.content.size, ' ', ' '));
        const { from, to, empty } = state.selection;
        const sel = empty ? 0 : countWords(state.doc.textBetween(from, to, ' ', ' '));
        setLabel(sel ? `${sel.toLocaleString()} of ${plural(total)} selected` : plural(total));
      }, 120);
    };
    update();
    editor.on('update', update);
    editor.on('selectionUpdate', update);
    return () => { clearTimeout(t); editor.off('update', update); editor.off('selectionUpdate', update); };
  }, [editor]);
  return <div className="word-count" aria-live="polite">{label}</div>;
}
