import type { Page } from "@playwright/test";
import type {
  RoomCommand,
  RoomView,
  ServerMessage,
} from "../../src/shared/model";

// An additional native browser WebSocket uses the same public protocol as the UI.
export async function exchange(
  page: Page,
  command?: RoomCommand,
): Promise<ServerMessage> {
  return page.evaluate(
    (command) =>
      new Promise<ServerMessage>((resolve, reject) => {
        // The session cookie identifies the signed-in User.
        const invite = location.pathname.split("/").pop()!;
        const ws = new WebSocket(
          `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
        );
        const requestId = crypto.randomUUID();
        let authenticated = false;
        const timer = setTimeout(() => {
          ws.close();
          reject(new Error("Protocol timeout"));
        }, 10000);
        ws.onopen = () =>
          ws.send(
            JSON.stringify({
              event: "authenticate",
              data: { invite },
            }),
          );
        ws.onmessage = (event) => {
          const message = JSON.parse(event.data as string) as ServerMessage;
          if (!authenticated && message.event === "view") {
            authenticated = true;
            if (command) {
              ws.send(
                JSON.stringify({
                  event: "command",
                  data: { requestId, command },
                }),
              );
              return;
            }
          } else if (
            command &&
            (message.event === "view" || message.event === "rejected") &&
            message.data.requestId !== requestId
          )
            return;
          clearTimeout(timer);
          ws.close();
          resolve(message);
        };
      }),
    command,
  );
}
export async function snapshot(page: Page): Promise<RoomView> {
  const response = await exchange(page);
  if (response.event !== "view") throw new Error("No participant view");
  return response.data.view;
}
