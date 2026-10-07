import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import type { User } from "../../shared/model.js";
import { Database } from "../storage/database.js";

export class AuthError extends Error {}
export const sessionCookie = "mtg_session";
const sessionMs = 30 * 86_400_000;
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

// scrypt parameters: N = 2^14, r = 8, p = 1, a 64-byte key and 16-byte salt.
const cost = { N: 16384, r: 8, p: 1 };
const keyLength = 64;
function derive(password: string, salt: Buffer, params = cost) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password.normalize("NFKC"),
      salt,
      keyLength,
      { ...params, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${cost.N}$${cost.r}$${cost.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [scheme, N, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
// Compared against when a username is unknown, so both cases take as long.
const unknownUserHash = hashPassword(randomBytes(16).toString("hex"));

// Failed sign-ins per username; after `maxFailures` it is locked for a while.
const maxFailures = 10;
const lockMs = 15 * 60_000;

export function readCookie(request: IncomingMessage, name: string) {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}
/** HTTPS directly or through a reverse proxy marks the cookie Secure. */
function secure(request: IncomingMessage) {
  return (
    !!(request.socket as TLSSocket).encrypted ||
    request.headers["x-forwarded-proto"] === "https"
  );
}
function cookie(
  request: IncomingMessage,
  value: string,
  maxAgeSeconds: number,
) {
  return `${sessionCookie}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure(request) ? "; Secure" : ""}`;
}

/** Users, their passwords and browser sessions. */
@Injectable()
export class UserService {
  private readonly failures = new Map<
    string,
    { count: number; since: number }
  >();
  constructor(@Inject(Database) private readonly database: Database) {}

  async register(username: string, password: string): Promise<User> {
    const user = { id: randomUUID(), name: username };
    const result = await this.database.pool.query(
      "INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [user.id, username, await hashPassword(password)],
    );
    if (!result.rowCount)
      throw new AuthError("That username is already taken.");
    return user;
  }

  async signIn(username: string, password: string): Promise<User> {
    const key = username.toLowerCase();
    const failure = this.failures.get(key);
    if (failure && Date.now() - failure.since >= lockMs)
      this.failures.delete(key);
    else if (failure && failure.count >= maxFailures)
      throw new AuthError("Too many failed sign-ins. Try again in 15 minutes.");
    const result = await this.database.pool.query<{
      id: string;
      username: string;
      password_hash: string;
    }>(
      "SELECT id, username, password_hash FROM users WHERE lower(username) = $1",
      [key],
    );
    const row = result.rows[0];
    const valid = await verifyPassword(
      password,
      row?.password_hash ?? (await unknownUserHash),
    );
    if (!row || !valid) {
      if (this.failures.size >= 10_000)
        for (const [name, entry] of this.failures)
          if (Date.now() - entry.since >= lockMs) this.failures.delete(name);
      const current = this.failures.get(key);
      this.failures.set(key, {
        count: (current?.count ?? 0) + 1,
        since: current?.since ?? Date.now(),
      });
      throw new AuthError("Incorrect username or password.");
    }
    this.failures.delete(key);
    return { id: row.id, name: row.username };
  }

  /** A new session token and the Set-Cookie header that carries it. */
  async createSession(request: IncomingMessage, userId: string) {
    const token = randomBytes(32).toString("hex");
    await this.database.pool.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
      [tokenHash(token), userId, new Date(Date.now() + sessionMs)],
    );
    return cookie(request, token, sessionMs / 1000);
  }
  async endSession(request: IncomingMessage) {
    const token = readCookie(request, sessionCookie);
    if (token)
      await this.database.pool.query(
        "DELETE FROM sessions WHERE token_hash = $1",
        [tokenHash(token)],
      );
    return cookie(request, "", 0);
  }

  async user(request: IncomingMessage): Promise<User | undefined> {
    const token = readCookie(request, sessionCookie);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
    const result = await this.database.pool.query<User>(
      "SELECT u.id, u.username AS name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()",
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
