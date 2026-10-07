import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { User } from "../../shared/model.js";
import { Database } from "../storage/database.js";

export const sessionCookie = "mtg_session";
const sessionMs = 30 * 86_400_000;
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function readCookie(request: IncomingMessage, name: string) {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}
export function cookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  path = "/",
) {
  const secure = process.env.PUBLIC_ORIGIN?.startsWith("https:")
    ? "; Secure"
    : "";
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`;
}

/** Users, their sign-in identities and browser sessions. */
@Injectable()
export class UserService {
  constructor(@Inject(Database) private readonly database: Database) {}

  /** The User for a provider identity, created on first sign-in. */
  async signIn(
    provider: string,
    subject: string,
    profile: { name: string; email?: string },
  ): Promise<User> {
    return this.database.transaction(async (client) => {
      const existing = await client.query<{ id: string; name: string }>(
        "SELECT u.id, u.name FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = $1 AND i.subject = $2",
        [provider, subject],
      );
      if (existing.rows[0]) return existing.rows[0];
      const user = { id: randomUUID(), name: profile.name.trim().slice(0, 64) };
      await client.query(
        "INSERT INTO users (id, name, email) VALUES ($1, $2, $3)",
        [user.id, user.name, profile.email ?? null],
      );
      await client.query(
        "INSERT INTO user_identities (provider, subject, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [provider, subject, user.id],
      );
      const winner = await client.query<{ id: string; name: string }>(
        "SELECT u.id, u.name FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = $1 AND i.subject = $2",
        [provider, subject],
      );
      // A concurrent first sign-in created the identity; discard this User.
      if (winner.rows[0].id !== user.id)
        await client.query("DELETE FROM users WHERE id = $1", [user.id]);
      return winner.rows[0];
    });
  }

  /** A new session token and the Set-Cookie header that carries it. */
  async createSession(userId: string) {
    const token = randomBytes(32).toString("hex");
    await this.database.pool.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
      [tokenHash(token), userId, new Date(Date.now() + sessionMs)],
    );
    return cookie(sessionCookie, token, sessionMs / 1000);
  }
  async endSession(request: IncomingMessage) {
    const token = readCookie(request, sessionCookie);
    if (token)
      await this.database.pool.query(
        "DELETE FROM sessions WHERE token_hash = $1",
        [tokenHash(token)],
      );
    return cookie(sessionCookie, "", 0);
  }

  async user(request: IncomingMessage): Promise<User | undefined> {
    const token = readCookie(request, sessionCookie);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    const result = await this.database.pool.query<User>(
      "SELECT u.id, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()",
      [tokenHash(token)],
    );
    return result.rows[0];
  }
  async require(request: IncomingMessage): Promise<User> {
    const user = await this.user(request);
    if (!user) throw new UnauthorizedException("Sign in to continue.");
    return user;
  }
  async purgeExpiredSessions() {
    await this.database.pool.query(
      "DELETE FROM sessions WHERE expires_at <= now()",
    );
  }
}
