import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import type { Catalog, RoomState } from "../../shared/model.js";

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
      CREATE TABLE IF NOT EXISTS catalog (id integer PRIMARY KEY CHECK (id = 1), document jsonb NOT NULL);
    `);
    await this.pool.query(
      "INSERT INTO catalog (id, document) VALUES (1, $1) ON CONFLICT DO NOTHING",
      [
        JSON.stringify({
          definitions: {},
          printings: {},
          names: {},
          importedSets: [],
        }),
      ],
    );
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

  async readCatalog(
    client: PoolClient | Pool = this.pool,
    lock = false,
  ): Promise<Catalog> {
    const result = await client.query<{ document: Catalog }>(
      `SELECT document FROM catalog WHERE id = 1${lock ? " FOR UPDATE" : ""}`,
    );
    return result.rows[0].document;
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
