import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

export const app = new Hono();

app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      defaultSrc: ["'self'"],
      fontSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
    },
    xFrameOptions: "DENY",
  }),
);

app.get("/api/health", (context) => {
  return context.json({
    service: "relay",
    status: "ok",
  });
});
