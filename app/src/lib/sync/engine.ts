import type { SupabaseClient } from '@supabase/supabase-js';
import { db, SYNCED_TABLES } from '../db';
import type { SyncedRecord, SyncedTable } from '../../types';

/** One row of the server-side `records` table (as exchanged with the remote). */
export interface RemoteRow {
  tbl: SyncedTable;
  id: string;
  data: Record<string, unknown>;
  updated_at: number;
  deleted: boolean;
  /** Assigned by the server; present on pulled rows only. */
  server_ts?: string;
}

export interface PullResult {
  rows: RemoteRow[];
  /** server_ts of the last returned row (null when nothing was returned). */
  nextCursor: string | null;
}

export interface RemoteStore {
  push(rows: RemoteRow[]): Promise<void>;
  /** Rows with server_ts > cursor, ordered by server_ts ascending, at most `limit`. */
  pull(cursor: string | null, limit: number): Promise<PullResult>;
}

export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncError';
  }
}

export const PUSH_BATCH = 500;
export const PULL_PAGE = 500;
/** Re-read this much history on the first page of every pull so late-committing concurrent pushes are not skipped. */
export const CURSOR_OVERLAP_MS = 10_000;
const CURSOR_KEY = 'cursor';

type LocalRecord = SyncedRecord & Record<string, unknown>;

function isSyncedTable(v: unknown): v is SyncedTable {
  return typeof v === 'string' && (SYNCED_TABLES as string[]).includes(v);
}

function isRemoteRow(v: unknown): v is RemoteRow {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    isSyncedTable(r.tbl) &&
    typeof r.id === 'string' &&
    typeof r.data === 'object' &&
    r.data !== null &&
    typeof r.updated_at === 'number' &&
    typeof r.deleted === 'boolean'
  );
}

// ---------- push ----------

export async function pushDirty(remote: RemoteStore): Promise<number> {
  let pushed = 0;
  for (const tbl of SYNCED_TABLES) {
    const table = db.table<LocalRecord, string>(tbl);
    const dirty = await table.where('_dirty').equals(1).toArray();
    for (let i = 0; i < dirty.length; i += PUSH_BATCH) {
      const batch = dirty.slice(i, i + PUSH_BATCH);
      const rows: RemoteRow[] = batch.map((rec) => {
        const { _dirty, ...data } = rec;
        return { tbl, id: rec.id, data, updated_at: rec.updatedAt, deleted: rec.deleted === true };
      });
      await remote.push(rows);
      // Clear _dirty only for rows that did not change while the request was in flight.
      await db.transaction('rw', table, async () => {
        for (const sent of batch) {
          const current = await table.get(sent.id);
          if (current && current.updatedAt === sent.updatedAt) {
            await table.update(sent.id, { _dirty: 0 });
          }
        }
      });
      pushed += batch.length;
    }
  }
  return pushed;
}

// ---------- pull ----------

function rewind(cursor: string | null, ms: number): string | null {
  if (!cursor) return null;
  const t = Date.parse(cursor);
  if (Number.isNaN(t)) return cursor;
  return new Date(t - ms).toISOString();
}

/** LWW-merge one page of remote rows into Dexie. Returns the number of rows that changed local data. */
export async function mergeRows(rows: RemoteRow[]): Promise<number> {
  const valid = rows.filter(isRemoteRow);
  if (valid.length === 0) return 0;
  const tables = SYNCED_TABLES.map((t) => db.table<LocalRecord, string>(t));
  let applied = 0;
  await db.transaction('rw', tables, async () => {
    for (const row of valid) {
      const table = db.table<LocalRecord, string>(row.tbl);
      const local = await table.get(row.id);
      const newer = !local || row.updated_at > local.updatedAt;
      const tie = !!local && row.updated_at === local.updatedAt && local._dirty !== 1;
      if (!newer && !tie) continue;
      const rec: LocalRecord = { ...row.data, id: row.id, updatedAt: row.updated_at, _dirty: 0 };
      if (row.deleted) rec.deleted = true;
      else if (rec.deleted) rec.deleted = false;
      await table.put(rec);
      if (newer) applied++;
    }
  });
  return applied;
}

export async function pullChanges(remote: RemoteStore, pageSize = PULL_PAGE): Promise<number> {
  const stored = await db.meta.get(CURSOR_KEY);
  let cursor: string | null = stored?.value ?? null;
  let pulled = 0;
  let first = true;
  for (;;) {
    const from = first ? rewind(cursor, CURSOR_OVERLAP_MS) : cursor;
    first = false;
    const { rows, nextCursor } = await remote.pull(from, pageSize);
    if (rows.length > 0) pulled += await mergeRows(rows);
    if (nextCursor && nextCursor !== cursor) {
      cursor = nextCursor;
      await db.meta.put({ id: CURSOR_KEY, value: nextCursor });
    }
    if (rows.length < pageSize || !nextCursor || nextCursor === from) break;
  }
  return pulled;
}

/** Pull first (so newer remote edits win without a wasted push), then push local changes. */
export async function runSync(remote: RemoteStore): Promise<{ pushed: number; pulled: number }> {
  const pulled = await pullChanges(remote);
  const pushed = await pushDirty(remote);
  return { pushed, pulled };
}

// ---------- Supabase remote ----------

export class SupabaseRemote implements RemoteStore {
  private client: SupabaseClient;
  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async push(rows: RemoteRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.client.rpc('push_records', { rows });
    if (error) throw new SyncError(error.message || '推送失败');
  }

  async pull(cursor: string | null, limit: number): Promise<PullResult> {
    let q = this.client
      .from('records')
      .select('tbl,id,data,updated_at,deleted,server_ts')
      .order('server_ts', { ascending: true })
      .order('tbl', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit);
    if (cursor) q = q.gt('server_ts', cursor);
    const { data, error } = await q;
    if (error) throw new SyncError(error.message || '拉取失败');
    const rows = (data as unknown[] | null ?? []).filter(isRemoteRow);
    const last = rows.length > 0 ? rows[rows.length - 1].server_ts : undefined;
    return { rows, nextCursor: typeof last === 'string' ? last : null };
  }
}

// ---------- In-memory remote (tests) ----------

export class InMemoryRemote implements RemoteStore {
  rows = new Map<string, RemoteRow>();
  pushCalls: RemoteRow[][] = [];
  private tick = 0;
  /** Optional hook run after rows are accepted (lets tests simulate concurrent local edits). */
  onPush?: (rows: RemoteRow[]) => Promise<void> | void;

  private stamp(): string {
    this.tick += 1;
    return new Date(Date.UTC(2026, 0, 1) + this.tick * 1000).toISOString();
  }

  async push(rows: RemoteRow[]): Promise<void> {
    this.pushCalls.push(rows);
    for (const r of rows) {
      const key = `${r.tbl}/${r.id}`;
      const existing = this.rows.get(key);
      if (existing && existing.updated_at >= r.updated_at) continue; // server keeps the newer side
      this.rows.set(key, { ...r, server_ts: this.stamp() });
    }
    await this.onPush?.(rows);
  }

  async pull(cursor: string | null, limit: number): Promise<PullResult> {
    const all = [...this.rows.values()]
      .filter((r) => !cursor || (r.server_ts ?? '') > cursor)
      .sort((a, b) => (a.server_ts ?? '').localeCompare(b.server_ts ?? ''))
      .slice(0, limit);
    return { rows: all.map((r) => ({ ...r })), nextCursor: all.length ? (all[all.length - 1].server_ts ?? null) : null };
  }
}
