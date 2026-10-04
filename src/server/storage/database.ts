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
