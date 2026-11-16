// SM-2 spaced repetition. grade: 0 = again, 1 = hard, 2 = good, 3 = easy.
import type { Card } from './types';

export function review(card: Card, grade: 0 | 1 | 2 | 3, now = new Date()): Partial<Card> {
  let { ease, interval_days: iv, reps, lapses } = card;
  if (grade === 0) {
    reps = 0; lapses += 1; iv = 0; ease = Math.max(1.3, ease - 0.2);
    return { ease, interval_days: iv, reps, lapses, due_at: new Date(now.getTime() + 10 * 60_000).toISOString(), last_reviewed_at: now.toISOString() };
  }
  const q = grade + 2; // map to SM-2 quality 3..5
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  reps += 1;
  if (reps === 1) iv = grade === 3 ? 4 : 1;
  else if (reps === 2) iv = grade === 3 ? 7 : 3;
  else iv = Math.round(iv * ease * (grade === 1 ? 0.6 : grade === 3 ? 1.3 : 1));
  iv = Math.max(1, iv);
  return { ease, interval_days: iv, reps, lapses, due_at: new Date(now.getTime() + iv * 86_400_000).toISOString(), last_reviewed_at: now.toISOString() };
}

export const isDue = (c: Card, now = new Date()) => !c.deleted_at && new Date(c.due_at) <= now;
export const isLearned = (c: Card) => c.interval_days >= 21;
