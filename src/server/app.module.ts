import { Global, Module } from "@nestjs/common";
import { ServeStaticModule } from "@nestjs/serve-static";
import { resolve } from "node:path";
import { Database } from "./storage/database.js";
import { RoomService } from "./room/room.service.js";
import { RoomController } from "./room/room.controller.js";
import { RoomGateway } from "./room/room.gateway.js";
import { CatalogModule } from "./catalog/catalog.module.js";
import { MatchService } from "./match/match.service.js";

@Global()
@Module({ providers: [Database], exports: [Database] })
export class StorageModule {}
@Module({ providers: [MatchService], exports: [MatchService] })
export class MatchModule {}
@Module({
  imports: [CatalogModule, MatchModule],
  providers: [RoomService, RoomGateway],
  controllers: [RoomController],
})
export class RoomModule {}
@Module({
  imports: [
    StorageModule,
    RoomModule,
    ServeStaticModule.forRoot({
      rootPath: resolve(process.cwd(), "dist/client"),
      exclude: ["/api/{*path}", "/ws"],
    }),
  ],
})
export class AppModule {}
