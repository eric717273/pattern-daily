import Dexie, { type EntityTable } from 'dexie';
import type {
  Attempt,
  CardState,
  DailySession,
  Profile,
  ReviewLog,
  SyncedTable,
  UserFrame,
} from '../types';

export class AppDB extends Dexie {
  cards!: EntityTable<CardState, 'id'>;
  reviews!: EntityTable<ReviewLog, 'id'>;
  attempts!: EntityTable<Attempt, 'id'>;
  sessions!: EntityTable<DailySession, 'id'>;
  userFrames!: EntityTable<UserFrame, 'id'>;
  profile!: EntityTable<Profile, 'id'>;
  /** Sync bookkeeping (local only): id = 'cursor', value = last pulled server timestamp (ISO). */
  meta!: EntityTable<{ id: string; value: string }, 'id'>;

  constructor(name = 'english-daily') {
    super(name);
    this.version(1).stores({
      cards: 'id, kind, refId, due, _dirty',
      reviews: 'id, cardId, reviewedAt, _dirty',
      attempts: 'id, refId, createdAt, _dirty',
      sessions: 'id, date, _dirty',
      userFrames: 'id, _dirty',
      profile: 'id, _dirty',
      meta: 'id',
    });
  }
}

export const SYNCED_TABLES: SyncedTable[] = ['cards', 'reviews', 'attempts', 'sessions', 'userFrames', 'profile'];

export const db = new AppDB();
