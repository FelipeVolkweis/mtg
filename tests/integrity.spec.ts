import { expect, test } from "@playwright/test";
import { act, startTable } from "./support/table";
import { exchange, snapshot } from "./support/peer";

test("repeated authentication on one socket cannot leave a disconnected guest connected", async ({
  browser,
}) => {
  const {
    pages: [alice, bob],
    contexts,
  } = await startTable(browser);
  await bob.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const invite = location.pathname.split("/").pop()!;
        const credential = localStorage.getItem(`mtg:${invite}`);
        const ws = new WebSocket(`ws://${location.host}/ws`);
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("Authentication timeout"));
        }, 10000);
        let quiet: ReturnType<typeof setTimeout>;
        ws.onopen = () => {
          for (let i = 0; i < 20; i++)
            ws.send(
              JSON.stringify({
                event: "authenticate",
                data: { invite, credential },
              }),
            );
        };
        ws.onmessage = () => {
          clearTimeout(quiet);
          quiet = setTimeout(() => {
            clearTimeout(timeout);
            ws.close();
            resolve();
          }, 200);
        };
      }),
  );
  await bob.goto("about:blank");
  const room = alice.getByLabel("Room lobby and Decklists", { exact: true });
  await room.click();
  await expect(
    alice.getByTestId("participants").locator("li").filter({ hasText: "Bob" }),
  ).toContainText("Disconnected");
  await Promise.all(contexts.map((context) => context.close()));
});
