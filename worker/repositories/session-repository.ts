import type { Session } from "../types/domain";

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string | null;
  expires_at: string;
  created_at: string;
  last_used_at: string;
};

export type CreateSessionInput = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  now: string;
};

const toSession = (row: SessionRow | null): Session | null => {
  if (!row || !row.token_hash) return null;
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at
  };
};

export class SessionRepository {
  constructor(private readonly db: D1Database) {}

  async findValidByTokenHash(tokenHash: string, now: string): Promise<Session | null> {
    const row = await this.db
      .prepare(
        "SELECT id, user_id, token_hash, expires_at, created_at, last_used_at FROM sessions WHERE token_hash = ? AND expires_at > ?"
      )
      .bind(tokenHash, now)
      .first<SessionRow>();
    return toSession(row);
  }

  async create(input: CreateSessionInput): Promise<Session> {
    await this.db
      .prepare(
        "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(input.id, input.userId, input.tokenHash, input.expiresAt, input.now, input.now)
      .run();

    return {
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: input.now,
      lastUsedAt: input.now
    };
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }

  async deleteExpired(now: string): Promise<number> {
    const result = await this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now).run();
    return result.meta.changes ?? 0;
  }
}
