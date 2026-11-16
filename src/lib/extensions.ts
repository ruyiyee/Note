// TipTap extension set shared by the editor, template conversion and export.
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { generateHTML, generateJSON } from '@tiptap/core';
import { signedUrl } from './attachments';

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
    StarterKit.configure({ link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } } }),
    Highlight.configure({ multicolor: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    StoredImage,
  ];
}

export function editorExtensions() {
  return [...baseExtensions(), Placeholder.configure({ placeholder: 'Start writing… (type [[ to link a note)' })];
}

export const htmlToDoc = (html: string) => generateJSON(html, baseExtensions());
export function docToHtml(doc: unknown): string {
  try { return generateHTML(doc as any, baseExtensions()); } catch { return ''; }
}
