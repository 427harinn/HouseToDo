import { SESSION_COOKIE_NAME } from "../lib/constants";
import { conflictError, unauthenticatedError } from "../lib/errors";
import { generateSessionToken, hashPassword, sha256Hex, verifyPassword } from "../lib/crypto";
import { nowIso, sessionExpiresAt } from "../lib/date";
import { readCookie } from "../lib/cookies";
import { SessionRepository } from "../repositories/session-repository";
import { UserRepository } from "../repositories/user-repository";
import type { AuthenticatedUser } from "../types/api";
import type { User } from "../types/domain";

export type RegisterStageLogger = (stage: string) => void;

export type AuthSessionResult = {
  user: AuthenticatedUser;
  token: string;
};

const toAuthenticatedUser = (user: User): AuthenticatedUser => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName
});

export class AuthService {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;

  constructor(db: D1Database) {
    this.users = new UserRepository(db);
    this.sessions = new SessionRepository(db);
  }

  async register(input: {
    email: string;
    password: string;
    displayName: string;
  }, onStage?: RegisterStageLogger): Promise<AuthSessionResult> {
    onStage?.("user-lookup-start");
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw conflictError("このメールアドレスはすでに登録されています。");

    const now = nowIso();
    onStage?.("password-hash-start");
    const passwordHash = await hashPassword(input.password);
    onStage?.("password-hash-complete");
    onStage?.("user-insert-start");
    const user = await this.users.create({
      id: crypto.randomUUID(),
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      now
    });
    onStage?.("user-insert-complete");

    return this.createSession(user, onStage);
  }

  async login(email: string, password: string): Promise<AuthSessionResult> {
    const user = await this.users.findByEmail(email);
    if (!user) throw unauthenticatedError();

    const verified = await verifyPassword(password, user.passwordHash);
    if (!verified) throw unauthenticatedError();

    return this.createSession(user);
  }

  async logout(token: string | null): Promise<void> {
    if (!token) return;
    await this.sessions.deleteByTokenHash(await sha256Hex(token));
  }

  async authenticateRequest(request: Request): Promise<AuthenticatedUser> {
    const token = readCookie(request, SESSION_COOKIE_NAME);
    if (!token) throw unauthenticatedError();

    const now = nowIso();
    const session = await this.sessions.findValidByTokenHash(await sha256Hex(token), now);
    if (!session) throw unauthenticatedError();

    const user = await this.users.findById(session.userId);
    if (!user) throw unauthenticatedError();

    return toAuthenticatedUser(user);
  }

  private async createSession(user: User, onStage?: RegisterStageLogger): Promise<AuthSessionResult> {
    const now = nowIso();
    const token = generateSessionToken();
    onStage?.("session-insert-start");
    await this.sessions.create({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: await sha256Hex(token),
      expiresAt: sessionExpiresAt(new Date(now)),
      now
    });
    onStage?.("session-insert-complete");

    return { user: toAuthenticatedUser(user), token };
  }
}
