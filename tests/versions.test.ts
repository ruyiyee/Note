import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/lib/supabase', () => ({ supabase: {} }));
vi.mock('../src/lib/db', () => ({ db: {} }));
import { snapshotDue, SNAPSHOT_EVERY_MS } from '../src/lib/versions';

describe('snapshotDue', () => {
  it('takes the first snapshot of a visit straight away', () => expect(snapshotDue(undefined, 1000)).toBe(true));
  it('waits 30 minutes between snapshots', () => {
    expect(SNAPSHOT_EVERY_MS).toBe(30 * 60 * 1000);
    expect(snapshotDue(0, SNAPSHOT_EVERY_MS - 1)).toBe(false);
    expect(snapshotDue(0, SNAPSHOT_EVERY_MS)).toBe(true);
  });
});
