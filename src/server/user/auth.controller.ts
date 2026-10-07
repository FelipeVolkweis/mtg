import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { credentialsSchema } from "../../shared/model.js";
import { AuthError, UserService } from "./user.service.js";

// TRUST_PROXY=N trusts N reverse proxy hops: the client is the address the
// outermost trusted proxy appended to X-Forwarded-For.
const trustedHops = /^[1-9]\d*$/.test(process.env.TRUST_PROXY ?? "")
  ? Number(process.env.TRUST_PROXY)
  : 0;
// Limiting key for a request: IPv4-mapped IPv6 unwrapped, IPv6 by /64 prefix.
function clientIp(request: IncomingMessage) {
  let ip = request.socket.remoteAddress ?? "unknown";
  const header = request.headers["x-forwarded-for"];
  if (trustedHops && header) {
    const hops = (Array.isArray(header) ? header.join(",") : header)
      .split(",")
      .map((entry) => entry.trim());
    if (hops.length >= trustedHops && hops[hops.length - trustedHops])
      ip = hops[hops.length - trustedHops]!;
  }
  ip = ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
    : left;
  return `${groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

// At most `rateLimit` register and login requests per IP each minute.
const rateLimit = 20;
const rateWindowMs = 60_000;
const attempts = new Map<string, { count: number; since: number }>();
function throttle(request: IncomingMessage) {
  const ip = clientIp(request);
  const now = Date.now();
  if (attempts.size >= 10_000)
    for (const [key, entry] of attempts)
      if (now - entry.since >= rateWindowMs) attempts.delete(key);
  const entry = attempts.get(ip);
  if (!entry || now - entry.since >= rateWindowMs)
    attempts.set(ip, { count: 1, since: now });
  else if (++entry.count > rateLimit)
    throw new HttpException(
      "Too many requests. Try again in a minute.",
      HttpStatus.TOO_MANY_REQUESTS,
    );
}

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
    throttle(request);
    const input = credentialsSchema.safeParse(body);
    if (!input.success)
      throw new BadRequestException(input.error.issues[0].message);
    try {
      const user = await this.users.register(
        input.data.username,
        input.data.password,
      );
      response.setHeader("Set-Cookie", await this.users.createSession(user.id));
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
    throttle(request);
    const input = credentialsSchema.safeParse(body);
    if (!input.success)
      throw new UnauthorizedException("Incorrect username or password.");
    try {
      const user = await this.users.signIn(
        clientIp(request),
        input.data.username,
        input.data.password,
      );
      response.setHeader("Set-Cookie", await this.users.createSession(user.id));
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
