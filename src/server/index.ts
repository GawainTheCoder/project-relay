import "dotenv/config";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

import { createApp } from "./app.js";
import { createRelayRepository } from "./db/repository.js";
import { createAppServices } from "./services.js";

const parsedPort = Number.parseInt(process.env.PORT ?? "8787", 10);
const port =
  Number.isSafeInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535
    ? parsedPort
    : 8787;
const hostname = process.env.HOST ?? "127.0.0.1";
const repository = createRelayRepository();
const app = createApp({
  repository,
  services: createAppServices(repository),
});

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist/client" }));
  app.get("*", serveStatic({ path: "./dist/client/index.html" }));
}

serve(
  {
    fetch: app.fetch,
    hostname,
    port,
  },
  ({ address, port: activePort }) => {
    console.info(`Relay API listening on http://${address}:${activePort}`);
  },
);
