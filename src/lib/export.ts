// Data export: full JSON backup and Markdown.
import TurndownService from 'turndown';
import { db } from './db';
import { docToHtml } from './extensions';
import { stripLocal } from './sync';
import type { Note } from './types';

const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
td.addRule('task', { filter: (n) => n.nodeName === 'LI' && (n as HTMLElement).dataset.type === 'taskItem',
  replacement: (c, n) => `- [${(n as HTMLElement).dataset.checked === 'true' ? 'x' : ' '}] ${c.trim()}\n` });
td.addRule('mark', { filter: 'mark', replacement: (c) => `==${c}==` });

export function noteToMarkdown(n: Note): string {
  const front = [`# ${n.title || 'Untitled'}`, '', n.tags.length ? `Tags: ${n.tags.map((t) => '#' + t).join(' ')}` : '', `Created: ${n.created_at}`, `Updated: ${n.updated_at}`, ''].filter((l, i) => l || i < 2).join('\n');
  return `${front}\n${td.turndown(docToHtml(n.content) || '')}\n`;
}

export function download(name: string, data: string, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function exportJSON() {
  const [notes, folders, attachments, cards] = await Promise.all([db.notes.toArray(), db.folders.toArray(), db.attachments.toArray(), db.cards.toArray()]);
  const data = { exported_at: new Date().toISOString(), format: 'notes-app-v1', notes: notes.map(stripLocal), folders: folders.map(stripLocal), attachments: attachments.map(stripLocal), cards: cards.map(stripLocal) };
  download(`notes-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
}

export async function exportMarkdown() {
  const notes = (await db.notes.toArray()).filter((n) => !n.deleted_at);
  const folders = new Map((await db.folders.toArray()).map((f) => [f.id, f.name]));
  const md = notes.sort((a, b) => a.title.localeCompare(b.title))
    .map((n) => `<!-- folder: ${n.folder_id ? folders.get(n.folder_id) ?? '' : ''} -->\n${noteToMarkdown(n)}`).join('\n---\n\n');
  download(`notes-${new Date().toISOString().slice(0, 10)}.md`, md, 'text/markdown');
}
