import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  BadRequestException,
} from "@nestjs/common";
import { z } from "zod";
import { RoomService } from "./room.service.js";

const name = z.string().trim().min(1).max(64);
@Controller("api")
export class RoomController {
  constructor(@Inject(RoomService) private readonly rooms: RoomService) {}
  @Get("health") health() {
    return { ok: true };
  }
  @Post("rooms") async create(@Body() body: unknown) {
    const result = z.object({ name }).strict().safeParse(body);
    if (!result.success)
      throw new BadRequestException("Enter a guest name of 1–64 characters.");
    return this.rooms.create(result.data.name);
  }
  @Post("rooms/:invite/join") async join(
    @Param("invite") invite: string,
    @Body() body: unknown,
  ) {
    const result = z
      .object({ name, credential: z.string().max(128).optional() })
      .strict()
      .safeParse(body);
    if (!result.success)
      throw new BadRequestException("Enter a guest name of 1–64 characters.");
    try {
      return await this.rooms.join(
        invite,
        result.data.name,
        result.data.credential,
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Unable to join Room",
      );
    }
  }
}
