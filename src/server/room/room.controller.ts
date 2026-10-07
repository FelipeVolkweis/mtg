import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { RoomService } from "./room.service.js";
import { UserService } from "../user/user.service.js";

@Controller("api")
export class RoomController {
  constructor(
    @Inject(RoomService) private readonly rooms: RoomService,
    @Inject(UserService) private readonly users: UserService,
  ) {}
  @Get("health") health() {
    return { ok: true };
  }
  @Post("rooms") async create(@Req() request: IncomingMessage) {
    return this.rooms.create(await this.users.require(request));
  }
  @Post("rooms/:invite/join") async join(
    @Req() request: IncomingMessage,
    @Param("invite") invite: string,
  ) {
    const user = await this.users.require(request);
    if (!/^[a-f0-9]{48}$/.test(invite)) throw new NotFoundException();
    try {
      return await this.rooms.join(invite, user);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Unable to join Room",
      );
    }
  }
}
