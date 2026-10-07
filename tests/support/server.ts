import { spawn } from "node:child_process";
import { expect } from "@playwright/test";

export async function startServer(
  databaseName: string,
  port: number,
  extraEnv: Record<string, string> = {},
) {
  const url = new URL(
    process.env.TEST_DATABASE_URL ??
      "postgres://mtg:mtg-local@127.0.0.1:5432/mtg_test",
  );
  url.pathname = `/${databaseName}`;
  const child = spawn(process.execPath, ["tests/start-server.mjs"], {
    env: {
      ...process.env,
      AUTH_DEV_LOGIN: "1",
      DATABASE_URL: url.toString(),
      PORT: String(port),
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (data) => {
    logs = (logs + data).slice(-5000);
  });
  child.stderr.on("data", (data) => {
    logs = (logs + data).slice(-5000);
  });
  const origin = `http://127.0.0.1:${port}`;
  let stopped = false;
  try {
    await expect
      .poll(
        async () => {
          if (child.exitCode !== null)
            throw new Error(`Test server exited: ${logs}`);
          return fetch(`${origin}/api/health`)
            .then((response) => response.ok)
            .catch(() => false);
        },
        { timeout: 15000 },
      )
      .toBe(true);
  } catch (error) {
    child.kill();
    throw error;
  }
  return {
    origin,
    databaseUrl: url.toString(),
    async stop() {
      if (stopped || child.exitCode !== null || child.signalCode !== null)
        return;
      stopped = true;
      const exited = new Promise<void>((resolve) =>
        child.once("exit", () => resolve()),
      );
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(timer);
    },
  };
}
