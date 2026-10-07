import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { credentialsSchema } from "../../shared/model.js";
import { AuthError, UserService } from "./user.service.js";

@Controller("api/auth")
export class AuthController {
  constructor(@Inject(UserService) private readonly users: UserService) {}

  @Get("me") async me(@Req() request: IncomingMessage) {
    return { user: (await this.users.user(request)) ?? null };
  }
  @Post("register") async register(
    @Req() request: IncomingMessage,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const input = credentialsSchema.safeParse(body);
    if (!input.success)
      throw new BadRequestException(input.error.issues[0].message);
    try {
      const user = await this.users.register(
        input.data.username,
        input.data.password,
      );
      response.setHeader(
        "Set-Cookie",
        await this.users.createSession(request, user.id),
      );
      return { user };
    } catch (error) {
      if (error instanceof AuthError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }
  @Post("login") @HttpCode(200) async login(
    @Req() request: IncomingMessage,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const input = credentialsSchema.safeParse(body);
    if (!input.success)
      throw new UnauthorizedException("Incorrect username or password.");
    try {
      const user = await this.users.signIn(
        input.data.username,
        input.data.password,
      );
      response.setHeader(
        "Set-Cookie",
        await this.users.createSession(request, user.id),
      );
      return { user };
    } catch (error) {
      if (error instanceof AuthError)
        throw new UnauthorizedException(error.message);
      throw error;
    }
  }
  @Post("logout") @HttpCode(204) async logout(
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader("Set-Cookie", await this.users.endSession(request));
  }
}
