import { createHash, randomBytes } from "node:crypto";

// Google OpenID Connect, Authorization Code flow with PKCE and a nonce.
const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const issuers = ["https://accounts.google.com", "accounts.google.com"];

export interface GoogleFlow {
  state: string;
  verifier: string;
  nonce: string;
  returnTo: string;
}
export interface GoogleProfile {
  subject: string;
  name: string;
  email?: string;
}

const base64url = (buffer: Buffer) => buffer.toString("base64url");
const random = () => base64url(randomBytes(32));

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return undefined;
  const origin =
    process.env.PUBLIC_ORIGIN ?? `http://localhost:${process.env.PORT ?? 3000}`;
  return {
    clientId,
    clientSecret,
    redirectUri: `${origin.replace(/\/$/, "")}/api/auth/google/callback`,
  };
}

export function startGoogleFlow(returnTo: string) {
  const config = googleConfig()!;
  const flow: GoogleFlow = {
    state: random(),
    verifier: random(),
    nonce: random(),
    returnTo,
  };
  const url = new URL(authorizationEndpoint);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: base64url(
      createHash("sha256").update(flow.verifier).digest(),
    ),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { flow, url: url.toString() };
}

export async function finishGoogleFlow(
  flow: GoogleFlow,
  code: string,
): Promise<GoogleProfile> {
  const config = googleConfig()!;
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: flow.verifier,
    }),
  });
  if (!response.ok) throw new Error("Google sign-in was not completed.");
  const { id_token } = (await response.json()) as { id_token?: string };
  // The ID token comes straight from Google's token endpoint over TLS, so its
  // claims are validated without checking the signature (OIDC Core 3.1.3.7).
  const claims = JSON.parse(
    Buffer.from(id_token?.split(".")[1] ?? "", "base64url").toString("utf8"),
  ) as Record<string, unknown>;
  if (
    !issuers.includes(claims.iss as string) ||
    claims.aud !== config.clientId ||
    typeof claims.exp !== "number" ||
    claims.exp * 1000 <= Date.now() ||
    claims.nonce !== flow.nonce ||
    typeof claims.sub !== "string"
  )
    throw new Error("Google sign-in returned an invalid identity.");
  const email =
    claims.email_verified === true && typeof claims.email === "string"
      ? claims.email
      : undefined;
  // A User is named after their email address, before the @.
  return {
    subject: claims.sub,
    name: email?.split("@")[0] || "Player",
    email,
  };
}
