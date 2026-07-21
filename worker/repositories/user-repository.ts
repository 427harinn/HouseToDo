import type { User } from "../types/domain";

type UserRow = {
  id: string;
  email: string | null;
  password_hash: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
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
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

export class UserRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.db
      .prepare(
        "SELECT id, email, password_hash, display_name, created_at, updated_at FROM users WHERE id = ?"
      )
      .bind(id)
      .first<UserRow>();
    return toUser(row);
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db
      .prepare(
        "SELECT id, email, password_hash, display_name, created_at, updated_at FROM users WHERE email = ?"
      )
      .bind(email)
      .first<UserRow>();
    return toUser(row);
  }

  async create(input: CreateUserInput): Promise<User> {
    await this.db
      .prepare(
        "INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(input.id, input.email, input.passwordHash, input.displayName, input.now, input.now)
      .run();

    return {
      id: input.id,
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      createdAt: input.now,
      updatedAt: input.now
    };
  }
}
