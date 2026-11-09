import type { Express } from "express";
import { z } from "zod";
import {
  ideaSchema,
  roastSchema,
  improvementSchema,
  experimentSchema,
  experimentProgressSchema,
  profileSchema,
} from "@roast/domain";

const bodies: Record<string, z.ZodType> = {
  "POST /api/v1/ideas": ideaSchema,
  "PATCH /api/v1/ideas/{id}": ideaSchema.extend({
    version: z.number().int().min(0),
  }),
  "POST /api/v1/ideas/{id}/roasts": roastSchema,
  "POST /api/v1/ideas/{id}/improvements": improvementSchema,
  "POST /api/v1/ideas/{id}/experiments": experimentSchema,
  "PATCH /api/v1/experiments/{id}": experimentProgressSchema,
  "PATCH /api/v1/profiles/me": profileSchema,
  "POST /api/v1/ideas/{id}/reactions": z.object({
    kind: z.enum(["interest", "bookmark", "follow"]),
    active: z.boolean(),
  }),
  "POST /api/v1/roasts/{id}/helpful": z.object({ active: z.boolean() }),
  "POST /api/v1/roasts/{id}/replies": z.object({
    body: z.string().min(2).max(1500),
  }),
  "POST /api/v1/ideas/{id}/collaborations": z.object({
    body: z.string().min(20).max(2000),
  }),
  "DELETE /api/v1/my-data": z.object({
    confirmation: z.enum(["DELETE MY DATA", "DELETE MY ACCOUNT"]),
  }),
};
const publicReads = new Set([
  "/api/v1/health",
  "/api/v1/visitor-session",
  "/api/v1/ideas",
  "/api/v1/ideas/{id}",
  "/api/v1/profiles/{username}",
  "/api/v1/media/{id}",
  "/api/v1/community-settings",
]);
const summaries: Record<string, string> = {
  "GET /api/v1/ideas": "Search and cursor-paginate visible ideas",
  "GET /api/v1/ideas/{id}": "Read an idea and its bounded discussion/journey",
  "POST /api/v1/ideas": "Create a draft or published idea",
  "PATCH /api/v1/ideas/{id}":
    "Publish a creator-authorized revision with a version check",
  "DELETE /api/v1/ideas/{id}": "Soft-delete an owned idea",
  "POST /api/v1/ideas/{id}/coffee":
    "Retired: use the creator Buy Me a Coffee URL (410)",
  "POST /api/v1/payments/webhook":
    "Retired: payments are handled externally (410)",
  "DELETE /api/v1/my-data":
    "Delete account, revoke sessions and anonymize community identity",
};

// Read the pinned Express 5 route table so documentation cannot silently omit
// newly installed API routes. Business authorization remains in route handlers.
export function openApiDocument(app: Express, origin: string) {
  const paths: Record<string, any> = {};
  for (const layer of (app as any).router.stack) {
    const route = layer.route;
    if (
      !route ||
      typeof route.path !== "string" ||
      !route.path.startsWith("/api/v1/") ||
      route.path.includes("*") ||
      route.path === "/api/v1/openapi.json"
    )
      continue;
    const path = route.path.replace(/:([a-zA-Z]+)/g, "{$1}");
    paths[path] ||= {};
    for (const method of Object.keys(route.methods).filter((m) =>
      ["get", "post", "patch", "delete"].includes(m),
    )) {
      const key = `${method.toUpperCase()} ${path}`;
      const parameters = [...path.matchAll(/\{(\w+)\}/g)].map((match) => ({
        name: match[1],
        in: "path",
        required: true,
        schema: { type: "string" },
      }));
      if (path === "/api/v1/ideas" && method === "get")
        parameters.push(
          ...["tab", "q", "category", "cursor", "limit"].map((name) => ({
            name,
            in: "query",
            required: false,
            schema: { type: "string" },
          })),
        );
      if (path.endsWith("/coffee") && method === "post")
        parameters.push({
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", format: "uuid" },
        } as any);
      const body = bodies[key];
      paths[path][method] = {
        operationId: `${method}_${path.replace(/[^a-zA-Z0-9]+/g, "_")}`,
        summary: summaries[key] || `${method.toUpperCase()} ${path}`,
        description:
          "See docs/API.md for detailed authorization, privacy and state transition contracts.",
        security:
          method === "get" && publicReads.has(path)
            ? []
            : [{ SessionCookie: [] }],
        parameters,
        ...(body
          ? {
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: z.toJSONSchema(body, { io: "input" }),
                  },
                },
              },
            }
          : {}),
        responses: {
          "200": { description: "Successful response" },
          ...(method === "post"
            ? { "201": { description: "Resource created" } }
            : {}),
          "400": { description: "Invalid request" },
          "401": { description: "Browser identity required: reload /api/v1/visitor-session" },
          "403": { description: "Permission denied" },
          "404": { description: "Unavailable or private resource" },
          "409": { description: "Stale or conflicting write" },
          "410": {
            description: "Retired payment flow; use external creator URL",
          },
          "429": { description: "Rate limited" },
          "503": { description: "Disabled or unavailable service" },
        },
      };
      if (path === "/api/v1/media" && method === "post")
        paths[path][method].requestBody = {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["image"],
                properties: {
                  image: {
                    type: "string",
                    format: "binary",
                    description:
                      "JPEG, PNG or WebP under 2 MB; normalized and stripped of metadata.",
                  },
                },
              },
            },
          },
        };
    }
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Roast & Toast API",
      version: "0.1.0",
      description:
        "Account-free browser ownership API backed by Supabase PostgreSQL. GET /api/v1/visitor-session creates a private browser cookie. Better Auth under /api/v1/auth/* is for moderator accounts. Creator support opens external Buy Me a Coffee pages.",
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        SessionCookie: {
          type: "apiKey",
          in: "cookie",
          name:
            process.env.NODE_ENV === "production"
              ? "__Host-rt-visitor"
              : "rt-visitor",
        },
      },
    },
    paths,
  };
}
