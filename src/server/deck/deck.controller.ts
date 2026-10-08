import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { deckInputSchema, id } from "../../shared/model.js";
import { UserService } from "../user/user.service.js";
import { DeckService } from "./deck.service.js";
import { deckRequestError } from "./deck-errors.js";

function deckId(value: string) {
  if (!id.safeParse(value).success) throw new NotFoundException();
  return value;
}
async function rejected<T>(operation: Promise<T>) {
  try {
    return await operation;
  } catch (error) {
    throw deckRequestError(error);
  }
}

@Controller("api/decks")
export class DeckController {
  constructor(
    @Inject(DeckService) private readonly decks: DeckService,
    @Inject(UserService) private readonly users: UserService,
  ) {}

  @Get() async list(@Req() request: IncomingMessage) {
    return this.decks.list((await this.users.require(request)).id);
  }
  @Post() async create(@Req() request: IncomingMessage, @Body() body: unknown) {
    const user = await this.users.require(request);
    const input = deckInputSchema.safeParse(body);
    if (!input.success)
      throw new BadRequestException("Enter a Decklist name, format and cards.");
    return rejected(this.decks.save(user.id, input.data));
  }
  @Put(":id") async update(
    @Req() request: IncomingMessage,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const user = await this.users.require(request);
    const input = deckInputSchema.safeParse(body);
    if (!input.success)
      throw new BadRequestException("Enter a Decklist name, format and cards.");
    return rejected(this.decks.save(user.id, input.data, deckId(id)));
  }
  @Delete(":id") @HttpCode(204) async delete(
    @Req() request: IncomingMessage,
    @Param("id") id: string,
  ) {
    const user = await this.users.require(request);
    await rejected(this.decks.delete(user.id, deckId(id)));
  }
}
