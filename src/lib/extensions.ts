// TipTap extension set shared by the editor and PDF export.
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { generateHTML } from '@tiptap/core';
import { signedUrl } from './attachments';
import { Drawing } from './drawing';
import { PageBreak } from './pages';

/** The four highlight colours offered in the toolbar. */
export const HIGHLIGHTS = ['#fdeaf1', '#fbd5e2', '#f7bcd0', '#f2a0bc'];

/** Image node that stores a private storage path and resolves a signed URL when shown. */
export const StoredImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      path: { default: null, parseHTML: (el) => el.getAttribute('data-path'), renderHTML: (a) => (a.path ? { 'data-path': a.path } : {}) },
    };
  },
  addNodeView() {
    return ({ node }) => {
      const img = document.createElement('img');
      img.alt = node.attrs.alt ?? '';
      img.className = 'note-img';
      if (node.attrs.path) {
        img.dataset.path = node.attrs.path;
        signedUrl(node.attrs.path).then((u) => (img.src = u)).catch(() => { img.alt = 'Image unavailable offline'; img.classList.add('img-missing'); });
      } else if (node.attrs.src) img.src = node.attrs.src;
      return { dom: img };
    };
  },
});

export function baseExtensions() {
  return [
    StarterKit.configure({ link: false }), // hyperlinks are intentionally disabled
    Highlight.configure({ multicolor: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    StoredImage,
    Drawing,
    PageBreak,
  ];
}

export function editorExtensions() {
  return [...baseExtensions(), Placeholder.configure({ placeholder: 'Start writing' })];
}

export function docToHtml(doc: unknown): string {
  try { return generateHTML(doc as any, baseExtensions()); } catch { return ''; }
}
