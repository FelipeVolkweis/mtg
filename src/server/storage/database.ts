import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import type { RoomState } from "../../shared/model.js";

@Injectable()
export class Database implements OnModuleInit, OnModuleDestroy {
  readonly pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://mtg:mtg-local@localhost:5432/mtg",
  });

  async onModuleInit() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (invite text PRIMARY KEY, document jsonb NOT NULL, last_activity timestamptz NOT NULL);
      CREATE INDEX IF NOT EXISTS rooms_activity ON rooms(last_activity);
      CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY, name text NOT NULL, email text, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS user_identities (provider text NOT NULL, subject text NOT NULL, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, PRIMARY KEY (provider, subject));
      CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, expires_at timestamptz NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS decks (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, document jsonb NOT NULL, updated_at timestamptz NOT NULL);
      CREATE INDEX IF NOT EXISTS decks_user ON decks(user_id, updated_at DESC);
    `);
  }

  async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveRoom(client: PoolClient, room: RoomState) {
    await client.query(
      "UPDATE rooms SET document = $1, last_activity = $2 WHERE invite = $3",
      [JSON.stringify(room), new Date(room.lastActivity), room.invite],
    );
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
