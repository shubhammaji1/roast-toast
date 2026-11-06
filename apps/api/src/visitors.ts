import type { Request, Response } from "express";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { transaction } from "./database.js";
import { ProfileModel, VisitorSession } from "./models.js";

export const visitorCookie =
  process.env.NODE_ENV === "production" ? "__Host-rt-visitor" : "rt-visitor";
const lifetime = 365 * 24 * 60 * 60 * 1000;
const attributes = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export function clearVisitor(res: Response) {
  res.clearCookie(visitorCookie, attributes);
}
export async function resolveVisitor(
  req: Request,
  res: Response,
  create: boolean,
) {
  const token = req.cookies?.[visitorCookie];
  if (typeof token === "string" && /^[a-f0-9]{64}$/.test(token)) {
    const session = await VisitorSession.findOne({
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: { $gt: new Date() },
    });
    if (session) {
      const profile = await ProfileModel.findOne({
        userId: session.userId,
        deletedAt: null,
      });
      if (profile) return { profile, session };
    }
  }
  if (!create) return null;
  const raw = randomBytes(32).toString("hex");
  const userId = `visitor_${randomUUID()}`;
  const result = await transaction(async (session) => {
    const [profile] = await ProfileModel.create(
      [
        {
          userId,
          name: "Guest maker",
          username: `guest_${randomBytes(8).toString("hex")}`,
          anonymous: true,
          role: "member",
          color: ["sage", "peach", "lavender", "yellow"][
            parseInt(raw.slice(0, 2), 16) % 4
          ],
          bio: "",
          website: "",
          skills: [],
        },
      ],
      { session },
    );
    const [visitor] = await VisitorSession.create(
      [
        {
          userId,
          tokenHash: createHash("sha256").update(raw).digest("hex"),
          expiresAt: new Date(Date.now() + lifetime),
        },
      ],
      { session },
    );
    return { profile, session: visitor };
  });
  res.cookie(visitorCookie, raw, { ...attributes, maxAge: lifetime });
  return result;
}
