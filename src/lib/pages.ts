// Page separator inside a note. The note stays one continuous document; a dashed
// divider labelled "Page N" marks where each new page starts. Numbers come from CSS
// counters, so they renumber automatically. In PDF export each page starts on a new sheet.
import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> { pageBreak: { insertPageBreak: () => ReturnType } }
}

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() { return [{ tag: 'div[data-page-break]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes({ 'data-page-break': '', class: 'page-break' }, HTMLAttributes)]; },
  addCommands() {
    return { insertPageBreak: () => ({ chain }) => chain().insertContent([{ type: 'pageBreak' }, { type: 'paragraph' }]).run() };
  },
});

/** Number of pages in a TipTap document. */
export function pageCount(doc: any): number {
  return 1 + ((doc?.content ?? []) as any[]).filter((n) => n.type === 'pageBreak').length;
}
