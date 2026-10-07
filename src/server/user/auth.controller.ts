import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { cookie, readCookie, UserService } from "./user.service.js";
import {
  finishGoogleFlow,
  googleConfig,
  startGoogleFlow,
  type GoogleFlow,
} from "./google.js";

const flowCookie = "mtg_google_flow";
const flowPath = "/api/auth/google";
const returnPath = /^\/(room\/[a-f0-9]{48}|decks)?$/;
/** Development and test sign-in by name; never enable it in production. */
const devLogin = () => process.env.AUTH_DEV_LOGIN === "1";

function redirect(
  response: ServerResponse,
  location: string,
  cookies: string[],
) {
  response.statusCode = 302;
  response.setHeader("Location", location);
  response.setHeader("Set-Cookie", cookies);
  response.end();
}

@Controller("api/auth")
export class AuthController {
  constructor(@Inject(UserService) private readonly users: UserService) {}

  @Get("config") config() {
    return { google: !!googleConfig(), dev: devLogin() };
  }
  @Get("me") async me(@Req() request: IncomingMessage) {
    return { user: (await this.users.user(request)) ?? null };
  }
  @Post("logout") @HttpCode(204) async logout(
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader("Set-Cookie", await this.users.endSession(request));
  }

  @Get("google") google(
    @Query("returnTo") returnTo: string | undefined,
    @Res() response: ServerResponse,
  ) {
    if (!googleConfig()) throw new NotFoundException();
    const { flow, url } = startGoogleFlow(
      returnTo && returnPath.test(returnTo) ? returnTo : "/",
    );
    redirect(response, url, [
      cookie(flowCookie, JSON.stringify(flow), 600, flowPath),
    ]);
  }
  @Get("google/callback") async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() request: IncomingMessage,
    @Res() response: ServerResponse,
  ) {
    if (!googleConfig()) throw new NotFoundException();
    const clearFlow = cookie(flowCookie, "", 0, flowPath);
    let flow: GoogleFlow | undefined;
    try {
      flow = JSON.parse(readCookie(request, flowCookie) ?? "null");
    } catch {}
    if (!flow || !code || !state || state !== flow.state)
      return redirect(response, "/?signin=failed", [clearFlow]);
    try {
      const profile = await finishGoogleFlow(flow, code);
      const user = await this.users.signIn("google", profile.subject, profile);
      redirect(response, flow.returnTo, [
        clearFlow,
        await this.users.createSession(user.id),
      ]);
    } catch {
      redirect(response, "/?signin=failed", [clearFlow]);
    }
  }

  @Post("dev") async dev(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    if (!devLogin()) throw new NotFoundException();
    const result = z
      .object({ name: z.string().trim().min(1).max(64) })
      .strict()
      .safeParse(body);
    if (!result.success)
      throw new BadRequestException("Enter a username of 1–64 characters.");
    const user = await this.users.signIn(
      "dev",
      result.data.name.normalize("NFKC").toLowerCase(),
      { name: result.data.name },
    );
    response.setHeader("Set-Cookie", await this.users.createSession(user.id));
    return { user };
  }
}
