import type { User } from "../types/domain";

type UserRow = {
  id: string;
  email: string | null;
  password_hash: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
  avatar_type: string | null;
  avatar_value: string | null;
  avatar_size_bytes: number | null;
  avatar_width: number | null;
  avatar_height: number | null;
};

export type CreateUserInput = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  now: string;
};

const toUser = (row: UserRow | null): User | null => {
  if (!row || !row.email || !row.password_hash) return null;
  const avatar =
    row.avatar_type === "r2" &&
    row.avatar_value &&
    row.avatar_size_bytes &&
    row.avatar_width &&
    row.avatar_height
      ? {
          type: "r2" as const,
          key: row.avatar_value,
          sizeBytes: row.avatar_size_bytes,
          width: row.avatar_width,
          height: row.avatar_height
        }
      : null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    avatar
  };
};

const userSelect = `id, email, password_hash, display_name, created_at, updated_at,
  avatar_type, avatar_value, avatar_size_bytes, avatar_width, avatar_height`;

export class UserRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.db
      .prepare(`SELECT ${userSelect} FROM users WHERE id = ?`)
      .bind(id)
      .first<UserRow>();
    return toUser(row);
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db
      .prepare(`SELECT ${userSelect} FROM users WHERE email = ?`)
      .bind(email)
      .first<UserRow>();
    return toUser(row);
  }

  async create(input: CreateUserInput): Promise<User> {
    await this.db
      .prepare(
        "INSERT INTO users (id, email, password_hash, display_name, avatar_type, avatar_value, avatar_size_bytes, avatar_width, avatar_height, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)"
      )
      .bind(
        input.id,
        input.email,
        input.passwordHash,
        input.displayName,
        input.now,
        input.now
      )
      .run();

    return {
      id: input.id,
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      createdAt: input.now,
      updatedAt: input.now,
      avatar: null
    };
  }

  async updateDisplayName(userId: string, displayName: string, now: string): Promise<User | null> {
    const result = await this.db
      .prepare("UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?")
      .bind(displayName, now, userId)
      .run();
    if ((result.meta.changes ?? 0) === 0) return null;
    return this.findById(userId);
  }

  async updateAvatar(
    userId: string,
    oldKey: string | null,
    avatar: { key: string; sizeBytes: number; width: number; height: number },
    now: string
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE users SET avatar_type = 'r2', avatar_value = ?, avatar_size_bytes = ?, avatar_width = ?, avatar_height = ?, updated_at = ?
       WHERE id = ? AND avatar_type IS ? AND avatar_value IS ?`
      )
      .bind(
        avatar.key,
        avatar.sizeBytes,
        avatar.width,
        avatar.height,
        now,
        userId,
        oldKey ? "r2" : null,
        oldKey
      )
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  prepareUpdateAvatar(
    userId: string,
    oldKey: string | null,
    avatar: { key: string; sizeBytes: number; width: number; height: number },
    now: string
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE users SET avatar_type = 'r2', avatar_value = ?, avatar_size_bytes = ?, avatar_width = ?, avatar_height = ?, updated_at = ?
       WHERE id = ? AND avatar_type IS ? AND avatar_value IS ?`
      )
      .bind(
        avatar.key,
        avatar.sizeBytes,
        avatar.width,
        avatar.height,
        now,
        userId,
        oldKey ? "r2" : null,
        oldKey
      );
  }

  async removeAvatar(userId: string, key: string, now: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE users SET avatar_type = NULL, avatar_value = NULL, avatar_size_bytes = NULL, avatar_width = NULL, avatar_height = NULL, updated_at = ?
       WHERE id = ? AND avatar_type = 'r2' AND avatar_value = ?`
      )
      .bind(now, userId, key)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  prepareRemoveAvatar(userId: string, key: string, now: string): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE users SET avatar_type = NULL, avatar_value = NULL, avatar_size_bytes = NULL, avatar_width = NULL, avatar_height = NULL, updated_at = ?
       WHERE id = ? AND avatar_type = 'r2' AND avatar_value = ?`
      )
      .bind(now, userId, key);
  }
}
