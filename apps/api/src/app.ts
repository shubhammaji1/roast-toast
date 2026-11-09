import { openApiDocument } from "./openapi.js";
import { canonicalApiPath, API_BASE_PATH } from "./api-paths.js";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cookieParser from "cookie-parser";
import { resolveVisitor, clearVisitor } from "./visitors.js";
import { VisitorSession } from "./models.js";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { query as queryDatabase, transaction } from "./database.js";
import { whereSQL } from "./repository.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import {
  ideaSchema,
  roastSchema,
  improvementSchema,
  experimentSchema,
  experimentProgressSchema,
  profileSchema,
  stages,
  communityConfigSchema,
} from "@roast/domain";
import {
  ProfileModel,
  IdeaModel,
  Revision,
  RoastModel,
  Reply,
  Reaction,
  Improvement,
  MilestoneModel,
  Collaboration,
  Notification,
  Report,
  Block,
  Audit,
  ModerationAction,
  Appeal,
  CoffeeOrder,
  EmailMessage,
  Setting,
} from "./models.js";
import type { Auth } from "./auth.js";
import { installMedia } from "./media.js";
import { Media } from "./models.js";
import { sharedRateStore } from "./infrastructure.js";
import { communityConfiguration } from "./configuration.js";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const id = (value: unknown) =>
  typeof value === "string" && /^[a-f0-9]{24}$/i.test(value)
    ? value
    : fail(404, "We couldn’t find that.");
const string = (value: unknown) => (typeof value === "string" ? value : "");
const doc = (value: any) =>
  value.toJSON ? value.toJSON() : { ...value, id: String(value._id) };
type Session = Awaited<ReturnType<Auth["api"]["getSession"]>>;
type AuthedRequest = Request & { member?: any; authSession?: Session };

export async function createApp(auth: Auth) {
  const app = express();
  const production = process.env.NODE_ENV === "production";
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const queryAt = req.url.indexOf("?");
    const path = queryAt < 0 ? req.url : req.url.slice(0, queryAt);
    const canonical = canonicalApiPath(path);
    if (canonical !== path) {
      req.url = canonical + (queryAt < 0 ? "" : req.url.slice(queryAt));
      res.setHeader("Content-Location", canonical);
      res.setHeader("Deprecation", "true");
    }
    next();
  });
  app.use(cookieParser());
  // Set only for a known reverse proxy; never trust arbitrary forwarded client IPs.
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(
    pinoHttp({
      enabled: process.env.NODE_ENV !== "test",
      redact: [
        "req.headers.cookie",
        "req.headers.authorization",
        "res.headers.set-cookie",
      ],
      serializers: {
        res: (res) => ({ statusCode: res.statusCode }),
        req: (req) => ({
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        }),
      },
    }),
  );
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api/v1",
    rateLimit({
      store: sharedRateStore("global"),
      windowMs: 60000,
      limit: process.env.NODE_ENV === "test" ? 5000 : 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "The table is busy. Give it a minute and try again." },
    }),
  );
  app.use((req, _res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== origin
    )
      return next(
        new HttpError(403, "This request came from an untrusted site."),
      );
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return next(new HttpError(403, "Cross-site requests are not allowed."));
    next();
  });
  app.use("/api/v1/auth", (req, _res, next) => {
    req.headers["x-rt-client-ip"] =
      req.ip || req.socket.remoteAddress || "127.0.0.1";
    next();
  });
  app.all("/api/v1/auth/{*splat}", toNodeHandler(auth));
  app.use(express.json({ limit: "32kb" }));
  app.get("/", (_req, res) => res.redirect(307, API_BASE_PATH));
  app.get(API_BASE_PATH, (_req, res) =>
    res.json({
      name: "Roast & Toast API",
      version: "1",
      baseUrl: `${origin}${API_BASE_PATH}`,
      documentation: `${origin}${API_BASE_PATH}/openapi.json`,
      resources: {
        ideas: `${API_BASE_PATH}/ideas`,
        visitorSession: `${API_BASE_PATH}/visitor-session`,
        creatorSupport:
          "Optional Buy Me a Coffee URL on each idea; payments occur externally.",
      },
    }),
  );
  app.get("/api/v1/health", async (_req, res) =>
    res.json({
      status: (await queryDatabase("SELECT 1")).rows.length
        ? "ok"
        : "unavailable",
      payments: "external",
    }),
  );
  app.use("/api/v1", async (req: AuthedRequest, res, next) => {
    req.authSession = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (req.authSession) {
      const { user } = req.authSession;
      const admins = (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase());
      req.member = await ProfileModel.findOneAndUpdate(
        { userId: user.id },
        {
          $setOnInsert: {
            userId: user.id,
            name: user.name,
            username: `maker_${user.id
              .replace(/[^a-z0-9]/gi, "")
              .slice(-14)
              .toLowerCase()}`,
            role:
              admins.includes(user.email.toLowerCase()) && user.emailVerified
                ? "admin"
                : "member",
            skills: [],
            bio: "",
            website: "",
            color: ["sage", "peach", "lavender", "yellow"][user.id.length % 4],
          },
        },
        { upsert: true, returnDocument: "after" },
      );
      if (
        admins.includes(user.email.toLowerCase()) &&
        user.emailVerified &&
        req.member.role !== "admin"
      ) {
        req.member.role = "admin";
        await req.member.save();
      }
    } else {
      const visitor = await resolveVisitor(
        req,
        res,
        req.path === "/visitor-session" ||
          (!["GET", "HEAD", "OPTIONS"].includes(req.method) &&
            !req.path.includes("webhook")),
      );
      if (visitor) req.member = visitor.profile;
    }
    next();
  });
  const member = (req: AuthedRequest, allowSuspended = false) => {
    if (!req.member || req.member.deletedAt)
      return fail(
        401,
        "Reload the page to start your browser session. No account is needed.",
      );
    if (req.member.suspended && !allowSuspended)
      return fail(
        403,
        "Posting from this browser is suspended. You can submit an appeal from your space.",
      );
    return req.member;
  };
  const admin = (req: AuthedRequest) => {
    const p = member(req);
    if (p.role !== "admin")
      return fail(403, "This area is for community moderators.");
    return p;
  };
  const profile = async (userId: string) => {
    const p = await ProfileModel.findOne({ userId, deletedAt: null }).lean();
    if (!p)
      return {
        userId: "",
        name: "Former member",
        username: "former_member",
        color: "sage",
        skills: [],
      };
    const {
      role: _role,
      suspended: _suspended,
      deletedAt: _deletedAt,
      ...safe
    } = p;
    return {
      ...safe,
      id: String(p._id),
      ...(p.private ? { bio: "", skills: [], website: "" } : {}),
    };
  };
  const blockedIds = async (req: AuthedRequest) =>
    req.member
      ? (
          await Block.find({
            $or: [
              { userId: req.member.userId },
              { blockedId: req.member.userId },
            ],
          }).lean()
        ).map((b) => (b.userId === req.member.userId ? b.blockedId : b.userId))
      : [];
  const loadIdea = async (
    req: AuthedRequest,
    value: unknown,
    owner = false,
  ) => {
    const idea = await IdeaModel.findOne({ _id: id(value), deletedAt: null });
    if (
      !idea ||
      (idea.status !== "published" && idea.authorId !== req.member?.userId) ||
      (await blockedIds(req)).includes(idea.authorId)
    )
      return fail(404, "That idea isn’t on the table.");
    if (owner && idea.authorId !== member(req).userId)
      return fail(403, "Only the creator can change this idea.");
    return idea;
  };
  const decorate = async (idea: any, req: AuthedRequest) => {
    const targetId = String(idea._id);
    const [author, interests, roastCount, mine] = await Promise.all([
      profile(idea.authorId),
      Reaction.countDocuments({ targetId, kind: "interest" }),
      RoastModel.countDocuments({
        ideaId: targetId,
        hidden: false,
        deletedAt: null,
      }),
      req.member
        ? Reaction.find({ userId: req.member.userId, targetId }).lean()
        : [],
    ]);
    return {
      ...doc(idea),
      author,
      interests,
      roastCount,
      saved: mine.some((r) => r.kind === "bookmark"),
      interested: mine.some((r) => r.kind === "interest"),
      following: mine.some((r) => r.kind === "follow"),
    };
  };
  const notify = async (
    userId: string,
    actorId: string,
    ideaId: string,
    body: string,
  ) => {
    if (userId !== actorId)
      await Notification.create({ userId, actorId, ideaId, body });
  };
  const writeLimit = rateLimit({
    store: sharedRateStore("posting"),
    windowMs: 60000,
    limit: process.env.NODE_ENV === "test" ? 5000 : 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Let this one brew. Please wait a minute before posting again.",
    },
  });
  app.use("/api/v1/media", writeLimit);
  installMedia(app, member, blockedIds);
  const validateMedia = async (
    coverImage: string | undefined,
    userId: string,
  ) => {
    if (
      coverImage &&
      !(await Media.exists({ _id: coverImage, ownerId: userId }))
    )
      return fail(400, "Choose an image you uploaded yourself.");
  };

  app.get("/api/v1/community-settings", async (_req, res) =>
    res.json(await communityConfiguration()),
  );
  app.patch(
    "/api/v1/admin/community-settings",
    async (req: AuthedRequest, res) => {
      const p = admin(req);
      const value = communityConfigSchema.parse(req.body);
      await Setting.updateOne(
        { key: "community-config" },
        { $set: { value } },
        { upsert: true },
      );
      await Audit.create({
        actorId: p.userId,
        action: "community.config.updated",
        detail:
          "Publishing, category availability or external support link settings changed.",
      });
      res.json(value);
    },
  );
  app.get("/api/v1/visitor-session", async (req: AuthedRequest, res) =>
    res.json({
      user:
        req.authSession?.user ||
        (req.member
          ? {
              id: req.member.userId,
              name: req.member.name,
              email: "",
              emailVerified: false,
              anonymous: true,
            }
          : null),
      profile: req.member ? doc(req.member) : null,
      demo: !production,
      google: Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
      ),
      payments: (await communityConfiguration()).coffeeEnabled
        ? "external"
        : "disabled",
    }),
  );
  app.get("/api/v1/ideas", async (req: AuthedRequest, res) => {
    const query = z
      .object({
        q: z.string().max(100).optional(),
        category: z.string().max(30).optional(),
        tab: z
          .enum([
            "for-you",
            "latest",
            "trending",
            "needs-feedback",
            "building",
            "saved",
            "mine",
            "following",
          ])
          .default("for-you"),
        cursor: z.string().max(500).optional(),
        limit: z.coerce.number().int().min(1).max(20).default(8),
      })
      .parse(req.query);
    const match: any = {
      deletedAt: null,
      status: "published",
      visibility: "public",
      authorId: { $nin: await blockedIds(req) },
    };
    if (query.tab === "mine") {
      match.authorId = member(req).userId;
      delete match.status;
      delete match.visibility;
    }
    if (query.tab === "saved" || query.tab === "following") {
      delete match.visibility;
      match._id = {
        $in: (
          await Reaction.find({
            userId: member(req).userId,
            kind: query.tab === "saved" ? "bookmark" : "follow",
          })
        ).map((r) => r.targetId),
      };
    }
    if (query.category && query.category !== "All ideas")
      match.category = query.category;
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      match.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { pitch: { $regex: escaped, $options: "i" } },
        { tags: { $regex: escaped, $options: "i" } },
      ];
    }
    if (query.tab === "building")
      match.stage = { $in: ["Building", "Beta", "Launched"] };
    if (query.tab === "needs-feedback")
      match.stage = { $in: ["Just an idea", "Getting roasted", "Validating"] };
    const values: any[] = [];
    const condition = whereSQL(match, values);
    let cursorCondition = "TRUE";
    if (query.cursor) {
      try {
        const cursor = JSON.parse(
          Buffer.from(query.cursor, "base64url").toString(),
        );
        id(cursor.id);
        if (query.tab === "trending") {
          if (!Number.isInteger(cursor.heat) || cursor.heat < 0)
            throw new Error("Invalid cursor");
          values.push(cursor.heat, cursor.id);
          cursorCondition = `(heat,id)<($${values.length - 1}::int,$${values.length})`;
        } else {
          const date = new Date(cursor.createdAt);
          if (Number.isNaN(date.getTime())) throw new Error("Invalid cursor");
          values.push(date.toISOString(), cursor.id);
          cursorCondition = `(data->>'createdAt',id)<($${values.length - 1},$${values.length})`;
        }
      } catch {
        return fail(
          400,
          "That page link has expired. Start from the first page.",
        );
      }
    }
    values.push(query.limit + 1);
    const result = await queryDatabase(
      `WITH candidates AS (SELECT id,data,${query.tab === "trending" ? "(SELECT count(*)::int FROM reactions r WHERE r.data->>'targetId'=ideas.id AND r.data->>'kind'='interest')" : "0"} AS heat FROM ideas WHERE ${condition}) SELECT id,data,heat FROM candidates WHERE ${cursorCondition} ORDER BY ${query.tab === "trending" ? "heat DESC" : "data->>'createdAt' DESC"}, id DESC LIMIT $${values.length}`,
      values,
    );
    const found = result.rows.map((row) => ({
      ...row.data,
      _id: row.id,
      heat: row.heat,
    }));
    const more = found.length > query.limit;
    const rows = found.slice(0, query.limit);
    const last = rows.at(-1);
    res.json({
      ideas: await Promise.all(rows.map((i) => decorate(i, req))),
      nextCursor:
        more && last
          ? Buffer.from(
              JSON.stringify({
                id: String(last._id),
                heat: last.heat,
                createdAt: last.createdAt,
              }),
            ).toString("base64url")
          : null,
    });
  });
  app.post("/api/v1/ideas", writeLimit, async (req: AuthedRequest, res) => {
    const p = member(req);
    const input = ideaSchema.parse(req.body);
    const config = await communityConfiguration();
    if (input.status === "published" && !config.publishingEnabled)
      return fail(
        503,
        "New pitches are paused for a moment. You can still save a draft.",
      );
    if (
      input.status === "published" &&
      !config.categories.includes(input.category)
    )
      return fail(
        400,
        "That category is temporarily closed to new pitches. Choose another category or save a draft.",
      );
    await validateMedia(input.coverImage, p.userId);
    const idea = await transaction(async (session) => {
      if (p.anonymous && input.creatorName) {
        await ProfileModel.updateOne(
          { userId: p.userId },
          { $set: { name: input.creatorName } },
          { session },
        );
        p.name = input.creatorName;
      }
      const [created] = await IdeaModel.create(
        [{ ...input, authorId: p.userId }],
        { session },
      );
      await Revision.create(
        [
          {
            ideaId: String(created._id),
            authorId: p.userId,
            ...input,
            revision: 1,
          },
        ],
        { session },
      );
      return created;
    });
    res.status(201).json(await decorate(idea, req));
  });
  app.get("/api/v1/ideas/:id", async (req: AuthedRequest, res) => {
    const idea = await loadIdea(req, req.params.id);
    const ideaId = String(idea._id);
    const blocked = await blockedIds(req);
    const [roasts, improvements, milestones, revisions] = await Promise.all([
      RoastModel.find({
        ideaId,
        hidden: false,
        deletedAt: null,
        authorId: { $nin: blocked },
      })
        .sort({ createdAt: -1 })
        .limit(100),
      Improvement.find({ ideaId, authorId: { $nin: blocked } })
        .sort({ createdAt: -1 })
        .limit(100),
      MilestoneModel.find({ ideaId }).sort({ createdAt: -1 }).limit(100),
      Revision.find({ ideaId })
        .sort({ revision: -1 })
        .select("title revision createdAt")
        .limit(50),
    ]);
    const detailRoasts = await Promise.all(
      roasts.map(async (r) => ({
        ...doc(r),
        author: await profile(r.authorId),
        helpful: await Reaction.countDocuments({
          targetId: String(r._id),
          kind: "helpful",
        }),
        voted: Boolean(
          req.member &&
          (await Reaction.exists({
            userId: req.member.userId,
            targetId: String(r._id),
            kind: "helpful",
          })),
        ),
        replies: await Promise.all(
          (
            await Reply.find({
              roastId: String(r._id),
              authorId: { $nin: blocked },
            })
              .sort({ createdAt: 1 })
              .limit(50)
          ).map(async (reply) => ({
            ...doc(reply),
            author: await profile(reply.authorId),
          })),
        ),
      })),
    );
    const detailImprovements = await Promise.all(
      improvements.map(async (s) => ({
        ...doc(s),
        author: await profile(s.authorId),
      })),
    );
    const ownsIdea = req.member?.userId === idea.authorId;
    const categoryCounts = new Map<string, number>();
    for (const suggestion of improvements) {
      categoryCounts.set(
        suggestion.category,
        (categoryCounts.get(suggestion.category) || 0) + 1,
      );
    }
    const feedbackSummary = ownsIdea
      ? {
          roastCount: detailRoasts.length,
          helpfulVotes: detailRoasts.reduce(
            (total, roast) => total + roast.helpful,
            0,
          ),
          suggestionCount: improvements.length,
          implementedSuggestions: improvements.filter(
            (suggestion) => suggestion.state === "Implemented",
          ).length,
          suggestionCategories: [...categoryCounts]
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
            .slice(0, 3),
        }
      : null;
    res.json({
      idea: await decorate(idea, req),
      roasts: detailRoasts,
      improvements: detailImprovements,
      milestones: milestones.map(doc),
      feedbackSummary,
      supporters: [],
      revisions: revisions.map((r) => ({
        id: String(r._id),
        title: r.title,
        version: r.revision,
        createdAt: r.createdAt,
      })),
    });
  });
  app.patch(
    "/api/v1/ideas/:id",
    writeLimit,
    async (req: AuthedRequest, res) => {
      const idea = await loadIdea(req, req.params.id, true);
      const p = member(req);
      const { version, ...input } = ideaSchema
        .extend({ version: z.number().int().min(0) })
        .parse(req.body);
      const config = await communityConfiguration();
      if (
        input.status === "published" &&
        idea.status !== "published" &&
        !config.publishingEnabled
      )
        return fail(
          503,
          "New pitches are paused for a moment. You can still save a draft.",
        );
      if (
        input.status === "published" &&
        (idea.status !== "published" || input.category !== idea.category) &&
        !config.categories.includes(input.category)
      )
        return fail(
          400,
          "That category is temporarily closed to new pitches. Choose another category or save a draft.",
        );
      await validateMedia(input.coverImage, p.userId);
      const updated = await transaction(async (session) => {
        const changed = await IdeaModel.findOneAndUpdate(
          { _id: idea._id, version },
          {
            $set: input,
            $inc: { version: 1 },
            // PATCH accepts a complete idea contract. An omitted optional cover
            // represents removal, while the public response keeps it optional.
            ...(!input.coverImage ? { $unset: { coverImage: true } } : {}),
          },
          { returnDocument: "after", session },
        );
        if (!changed)
          return fail(
            409,
            "This idea changed in another tab. Refresh before saving again.",
          );
        if (p.anonymous && input.creatorName) {
          await ProfileModel.updateOne(
            { userId: p.userId },
            { $set: { name: input.creatorName } },
            { session },
          );
          p.name = input.creatorName;
        }
        await Revision.create(
          [
            {
              ideaId: String(idea._id),
              authorId: p.userId,
              ...input,
              revision: version + 2,
            },
          ],
          { session },
        );
        return changed;
      });
      res.json(await decorate(updated, req));
    },
  );
  app.delete("/api/v1/ideas/:id", async (req: AuthedRequest, res) => {
    const idea = await loadIdea(req, req.params.id, true);
    idea.deletedAt = new Date();
    await idea.save();
    await Audit.create({
      actorId: member(req).userId,
      action: "idea.deleted",
      targetId: String(idea._id),
    });
    res.json({ ok: true });
  });
  app.post(
    "/api/v1/ideas/:id/reactions",
    writeLimit,
    async (req: AuthedRequest, res) => {
      const p = member(req);
      const idea = await loadIdea(req, req.params.id);
      const { kind, active } = z
        .object({
          kind: z.enum(["interest", "bookmark", "follow"]),
          active: z.boolean(),
        })
        .parse(req.body);
      const key = { userId: p.userId, targetId: String(idea._id), kind };
      if (active)
        await Reaction.updateOne(key, { $setOnInsert: key }, { upsert: true });
      else await Reaction.deleteOne(key);
      res.json(await decorate(idea, req));
    },
  );
  app.post(
    "/api/v1/ideas/:id/roasts",
    writeLimit,
    async (req: AuthedRequest, res) => {
      const p = member(req);
      const idea = await loadIdea(req, req.params.id);
      const input = roastSchema.parse(req.body);
      if (
        ["Light", "Honest", "Savage"].indexOf(input.tone) >
        ["Light", "Honest", "Savage"].indexOf(idea.tone)
      )
        return fail(
          400,
          `This creator is inviting ${idea.tone.toLowerCase()} feedback. Choose a gentler tone.`,
        );
      const roast = await RoastModel.create({
        ...input,
        ideaId: String(idea._id),
        authorId: p.userId,
      });
      await notify(
        idea.authorId,
        p.userId,
        String(idea._id),
        `${p.name} left a ${input.tone.toLowerCase()} roast on “${idea.title}”.`,
      );
      res.status(201).json(doc(roast));
    },
  );
  const loadRoast = async (req: AuthedRequest) => {
    const roast = await RoastModel.findOne({
      _id: id(req.params.id),
      hidden: false,
      deletedAt: null,
    });
    if (!roast || (await blockedIds(req)).includes(roast.authorId))
      return fail(404, "That roast is unavailable.");
    const idea = await loadIdea(req, roast.ideaId);
    return { roast, idea };
  };
  app.post(
    "/api/v1/roasts/:id/helpful",
    writeLimit,
    async (req: AuthedRequest, res) => {
      const p = member(req);
      const { roast } = await loadRoast(req);
      const { active } = z.object({ active: z.boolean() }).parse(req.body);
      const key = {
        userId: p.userId,
        targetId: String(roast._id),
        kind: "helpful",
      };
      if (active)
        await Reaction.updateOne(key, { $setOnInsert: key }, { upsert: true });
      else await Reaction.deleteOne(key);
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/v1/roasts/:id/replies",
    writeLimit,
    async (req: AuthedRequest, res) => {
      const p = member(req);
      const { roast, idea } = await loadRoast(req);
      const { body } = z
        .object({ body: z.string().trim().min(2).max(1500) })
        .parse(req.body);
      const reply = await Reply.create({
        ideaId: String(idea._id),
        roastId: String(roast._id),
        authorId: p.userId,
        body,
      });
      await notify(
        roast.authorId,
        p.userId,
        String(idea._id),
        `${p.name} replied to your roast.`,
      );
      res.status(201).json(doc(reply));
    },
  );
  app.post(
    "/api/v1/roasts/:id/acknowledge",
    async (req: AuthedRequest, res) => {
      const { roast, idea } = await loadRoast(req);
      if (idea.authorId !== member(req).userId)
        return fail(403, "Only the creator can acknowledge feedback.");
      roast.acknowledged = !roast.acknowledged;
      await roast.save();
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/v1/ideas/:id/improvements",
    writeLimit,
    async (req: AuthedRequest, res) => {
      const p = member(req);
      const idea = await loadIdea(req, req.params.id);
      const suggestion = await Improvement.create({
        ...improvementSchema.parse(req.body),
        ideaId: String(idea._id),
        authorId: p.userId,
      });
      await notify(
        idea.authorId,
        p.userId,
        String(idea._id),
        `${p.name} suggested an improvement.`,
      );
      res.status(201).json(doc(suggestion));
    },
  );
  app.patch("/api/v1/improvements/:id", async (req: AuthedRequest, res) => {
    const suggestion = await Improvement.findById(id(req.params.id));
    if (!suggestion) return fail(404, "Suggestion not found.");
    await loadIdea(req, suggestion.ideaId, true);
    const { state } = z
      .object({
        state: z.enum(["Exploring", "Accepted", "Declined", "Implemented"]),
      })
      .parse(req.body);
    suggestion.state = state;
    await suggestion.save();
    res.json(doc(suggestion));
  });
  app.post(
    "/api/v1/ideas/:id/milestones",
    writeLimit,
    async (req: AuthedRequest, res) => {
      const p = member(req);
      const idea = await loadIdea(req, req.params.id, true);
      const input = z
        .object({
          title: z.string().trim().min(5).max(140),
          body: z.string().trim().min(12).max(2000),
          stage: z.enum(stages),
        })
        .parse(req.body);
      const milestone = await transaction(async (session) => {
        const [m] = await MilestoneModel.create(
          [{ ...input, ideaId: String(idea._id), authorId: p.userId }],
          { session },
        );
        const updated = await IdeaModel.findOneAndUpdate(
          { _id: idea._id },
          { $set: { stage: input.stage }, $inc: { version: 1 } },
          { session, returnDocument: "after" },
        );
        await Revision.create(
          [
            {
              ideaId: String(idea._id),
              authorId: p.userId,
              title: updated!.title,
              pitch: updated!.pitch,
              problem: updated!.problem,
              solution: updated!.solution,
              stage: input.stage,
              revision: updated!.version + 1,
            },
          ],
          { session },
        );
        return m;
      });
      const followers = await Reaction.find({
        targetId: String(idea._id),
        kind: "follow",
      });
      await Promise.all(
        followers.map((f) =>
          notify(
            f.userId,
            p.userId,
            String(idea._id),
            `${p.name} shared a build update: ${input.title}`,
          ),
        ),
      );
      res.status(201).json(doc(milestone));
    },
  );
  app.post(
    "/api/v1/ideas/:id/experiments",
    writeLimit,
    async (req: AuthedRequest, res) => {
      const p = member(req);
      const idea = await loadIdea(req, req.params.id, true);
      const input = experimentSchema.parse(req.body);
      const experiment = await MilestoneModel.create({
        kind: "experiment",
        title: input.hypothesis,
        body: input.experiment,
        hypothesis: input.hypothesis,
        successCriteria: input.successCriteria,
        status: "Planned",
        outcome: "",
        stage: idea.stage,
        ideaId: String(idea._id),
        authorId: p.userId,
      });
      res.status(201).json(doc(experiment));
    },
  );
  app.patch(
    "/api/v1/experiments/:id",
    writeLimit,
    async (req: AuthedRequest, res) => {
      const experiment = await MilestoneModel.findById(id(req.params.id));
      if (!experiment || experiment.kind !== "experiment")
        return fail(404, "Experiment not found.");
      await loadIdea(req, experiment.ideaId, true);
      const input = experimentProgressSchema.parse(req.body);
      experiment.status = input.status;
      if (input.outcome !== undefined) experiment.outcome = input.outcome;
      await experiment.save();
      res.json(doc(experiment));
    },
  );
  app.post(
    "/api/v1/ideas/:id/collaborations",
    writeLimit,
    async (req: AuthedRequest, res) => {
      const p = member(req);
      const idea = await loadIdea(req, req.params.id);
      if (idea.authorId === p.userId)
        return fail(400, "Invite someone else to build this one with you.");
      const { body } = z
        .object({ body: z.string().trim().min(20).max(2000) })
        .parse(req.body);
      const result = await Collaboration.create({
        ideaId: String(idea._id),
        authorId: p.userId,
        creatorId: idea.authorId,
        body,
      });
      await notify(
        idea.authorId,
        p.userId,
        String(idea._id),
        `${p.name} would like to build with you.`,
      );
      res.status(201).json(doc(result));
    },
  );
  app.get("/api/v1/collaborations", async (req: AuthedRequest, res) => {
    const p = member(req);
    const rows = await Collaboration.find({
      $or: [{ creatorId: p.userId }, { authorId: p.userId }],
    })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(
      await Promise.all(
        rows.map(async (row) => ({
          ...doc(row),
          author: await profile(row.authorId),
        })),
      ),
    );
  });
  app.patch("/api/v1/collaborations/:id", async (req: AuthedRequest, res) => {
    const p = member(req);
    const { state } = z
      .object({ state: z.enum(["accepted", "declined"]) })
      .parse(req.body);
    const row = await Collaboration.findOneAndUpdate(
      { _id: id(req.params.id), creatorId: p.userId, state: "pending" },
      { state },
      { returnDocument: "after" },
    );
    if (!row) return fail(404, "Request not found or already reviewed.");
    await notify(
      row.authorId,
      p.userId,
      row.ideaId,
      `${p.name} ${state} your collaboration request.`,
    );
    res.json(doc(row));
  });

  app.get("/api/v1/profiles/:username", async (req: AuthedRequest, res) => {
    const p = await ProfileModel.findOne({
      username: string(req.params.username).toLowerCase(),
      deletedAt: null,
    });
    if (!p || (await blockedIds(req)).includes(p.userId))
      return fail(404, "That profile isn’t here.");
    const own = req.member?.userId === p.userId;
    const ideas =
      p.private && !own
        ? []
        : await IdeaModel.find({
            authorId: p.userId,
            status: "published",
            visibility: "public",
            deletedAt: null,
          })
            .sort({ createdAt: -1 })
            .limit(50);
    res.json({
      profile: own ? doc(p) : await profile(p.userId),
      ideas: await Promise.all(ideas.map((i) => decorate(i, req))),
      private: p.private && !own,
    });
  });
  app.patch("/api/v1/profiles/me", async (req: AuthedRequest, res) => {
    const p = member(req);
    const input = profileSchema.parse(req.body);
    const changed = await ProfileModel.findOneAndUpdate(
      { userId: p.userId },
      { $set: input },
      { returnDocument: "after", runValidators: true },
    );
    res.json(doc(changed));
  });
  app.get("/api/v1/notifications", async (req: AuthedRequest, res) => {
    const p = member(req);
    res.json(
      (
        await Notification.find({ userId: p.userId })
          .sort({ createdAt: -1 })
          .limit(100)
      ).map(doc),
    );
  });
  app.post("/api/v1/notifications/read", async (req: AuthedRequest, res) => {
    const p = member(req);
    await Notification.updateMany(
      { userId: p.userId, readAt: null },
      { readAt: new Date() },
    );
    res.json({ ok: true });
  });
  app.post("/api/v1/reports", writeLimit, async (req: AuthedRequest, res) => {
    const p = member(req);
    const input = z
      .object({
        targetId: z.string().min(1).max(100),
        targetType: z.enum(["idea", "roast", "user"]),
        reason: z.string().trim().min(10).max(1000),
      })
      .parse(req.body);
    if (input.targetType === "idea") await loadIdea(req, input.targetId);
    if (input.targetType === "roast") {
      const r = await RoastModel.findById(id(input.targetId));
      if (!r) return fail(404, "Roast not found.");
      await loadIdea(req, r.ideaId);
    }
    await Report.create({ ...input, reporterId: p.userId });
    res.status(201).json({ ok: true });
  });
  app.post("/api/v1/blocks", async (req: AuthedRequest, res) => {
    const p = member(req);
    const { blockedId, active } = z
      .object({ blockedId: z.string().min(1).max(100), active: z.boolean() })
      .parse(req.body);
    if (p.userId === blockedId) return fail(400, "You cannot block yourself.");
    if (active)
      await Block.updateOne(
        { userId: p.userId, blockedId },
        { $setOnInsert: { userId: p.userId, blockedId } },
        { upsert: true },
      );
    else await Block.deleteOne({ userId: p.userId, blockedId });
    res.json({ ok: true });
  });
  app.get("/api/v1/blocks", async (req: AuthedRequest, res) => {
    const p = member(req);
    res.json(
      await Promise.all(
        (await Block.find({ userId: p.userId })).map(async (b) => ({
          ...doc(b),
          profile: await profile(b.blockedId),
        })),
      ),
    );
  });
  app.post("/api/v1/appeals", writeLimit, async (req: AuthedRequest, res) => {
    const p = member(req, true);
    const { body } = z
      .object({ body: z.string().trim().min(20).max(2000) })
      .parse(req.body);
    await Appeal.create({ userId: p.userId, body });
    res.status(201).json({ ok: true });
  });

  // The platform never collects payments. Previously simulated checkout routes
  // are retired; existing records remain available only to authorized moderators.
  const externalPayments = (_req: Request, res: Response) =>
    res.status(410).json({
      error:
        "Support creators directly through their Buy Me a Coffee link. Roast & Toast does not process payments.",
    });
  app.post("/api/v1/ideas/:id/coffee", externalPayments);
  app.post("/api/v1/coffee/:id/simulate", externalPayments);
  app.post("/api/v1/coffee/:id/refund", externalPayments);
  app.get("/api/v1/coffee", externalPayments);
  app.post("/api/v1/payments/webhook", externalPayments);
  app.get("/api/v1/my-data", async (req: AuthedRequest, res) => {
    const p = member(req);
    const filter = { authorId: p.userId };
    const [
      ideas,
      roasts,
      replies,
      suggestions,
      collaborations,
      reactions,
      orders,
    ] = await Promise.all([
      IdeaModel.find(filter).lean(),
      RoastModel.find(filter).lean(),
      Reply.find(filter).lean(),
      Improvement.find(filter).lean(),
      Collaboration.find(filter).lean(),
      Reaction.find({ userId: p.userId }).lean(),
      CoffeeOrder.find({ userId: p.userId }).lean(),
    ]);
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="roast-and-toast-data.json"',
    );
    res.json({
      exportedAt: new Date(),
      profile: doc(p),
      account: req.authSession?.user || {
        id: p.userId,
        name: p.name,
        anonymous: true,
      },
      ideas,
      roasts,
      replies,
      suggestions,
      collaborations,
      reactions,
      orders,
    });
  });
  app.delete("/api/v1/my-data", async (req: AuthedRequest, res) => {
    const p = member(req, true);
    const { confirmation } = z
      .object({
        confirmation: z.literal(
          p.anonymous ? "DELETE MY DATA" : "DELETE MY ACCOUNT",
        ),
      })
      .parse(req.body);
    void confirmation;
    if (
      req.authSession &&
      new Date(req.authSession.session.createdAt).getTime() <
        Date.now() - 10 * 60000
    )
      return fail(
        403,
        "Sign out and sign in again before deleting your account.",
      );
    if (req.authSession)
      await auth.api.revokeSessions({ headers: fromNodeHeaders(req.headers) });
    const uid = p.userId;

    await transaction(async (session) => {
      await IdeaModel.updateMany(
        { authorId: uid },
        { deletedAt: new Date() },
        { session },
      );
      await RoastModel.updateMany(
        { authorId: uid },
        { deletedAt: new Date() },
        { session },
      );
      await Reply.deleteMany({ authorId: uid }, { session });
      await Reaction.deleteMany({ userId: uid }, { session });
      await ProfileModel.updateOne(
        { userId: uid },
        {
          $set: {
            deletedAt: new Date(),
            name: "Former member",
            username: `deleted_${randomUUID().slice(0, 12)}`,
            bio: "",
            skills: [],
            website: "",
          },
        },
        { session },
      );
      await Notification.deleteMany({ userId: uid }, { session });
      await VisitorSession.deleteMany({ userId: uid }, { session });
      if (req.authSession) {
        await EmailMessage.deleteMany(
          { to: req.authSession.user.email },
          { session },
        );
        await queryDatabase('DELETE FROM public."user" WHERE id=$1', [uid]);
      }
      await Audit.create(
        [
          {
            actorId: uid,
            action: "account.deleted",
            detail:
              "Financial records retained for audit; community identity anonymized.",
          },
        ],
        { session },
      );
    });
    if (p.anonymous) clearVisitor(res);
    res.json({ ok: true });
  });
  if (!production)
    app.get("/api/v1/dev/outbox", async (req: AuthedRequest, res) => {
      const p = member(req);
      void p;
      if (!req.authSession)
        return fail(
          404,
          "There is no email inbox for an account-free browser session.",
        );
      res.json(
        (
          await EmailMessage.find({ to: req.authSession!.user.email })
            .sort({ createdAt: -1 })
            .limit(10)
        ).map(doc),
      );
    });

  app.get("/api/v1/admin", async (req: AuthedRequest, res) => {
    admin(req);
    const [reports, appeals, people, audit, orders, settings] =
      await Promise.all([
        Report.find().sort({ createdAt: -1 }).limit(100),
        Appeal.find().sort({ createdAt: -1 }).limit(100),
        ProfileModel.find({ deletedAt: null })
          .select("name username userId role suspended demo")
          .limit(100),
        Audit.find().sort({ createdAt: -1 }).limit(100),
        CoffeeOrder.find()
          .select("state mode amount currency createdAt")
          .sort({ createdAt: -1 })
          .limit(100),
        Setting.find({ key: { $ne: "demo-seeded" } }),
      ]);
    res.json({
      reports: reports.map(doc),
      appeals: appeals.map(doc),
      users: people.map(doc),
      audit: audit.map(doc),
      orders: orders.map(doc),
      settings: settings.map(doc),
    });
  });
  app.patch("/api/v1/admin/reports/:id", async (req: AuthedRequest, res) => {
    const p = admin(req);
    const { state, resolution, hide } = z
      .object({
        state: z.enum(["resolved", "dismissed"]),
        resolution: z.string().trim().min(10).max(1000),
        hide: z.boolean().default(false),
      })
      .parse(req.body);
    const report = await Report.findById(id(req.params.id));
    if (!report) return fail(404, "Report not found.");
    await transaction(async (session) => {
      if (hide && report.targetType === "roast")
        await RoastModel.updateOne(
          { _id: id(report.targetId) },
          { hidden: true },
          { session },
        );
      if (hide && report.targetType === "idea")
        await IdeaModel.updateOne(
          { _id: id(report.targetId) },
          { status: "archived" },
          { session },
        );
      report.state = state;
      report.resolution = resolution;
      await report.save({ session });
      await ModerationAction.create(
        [
          {
            actorId: p.userId,
            targetId: report.targetId,
            action: hide ? "hide" : state,
            reason: resolution,
          },
        ],
        { session },
      );
      await Audit.create(
        [
          {
            actorId: p.userId,
            action: "report.reviewed",
            targetId: String(report._id),
            detail: resolution,
          },
        ],
        { session },
      );
    });
    res.json({ ok: true });
  });
  app.patch("/api/v1/admin/users/:id", async (req: AuthedRequest, res) => {
    const p = admin(req);
    const { suspended, reason } = z
      .object({
        suspended: z.boolean(),
        reason: z.string().trim().min(10).max(500),
      })
      .parse(req.body);
    const target = await ProfileModel.findById(id(req.params.id));
    if (!target || target.role === "admin")
      return fail(400, "This account cannot be suspended here.");
    target.suspended = suspended;
    await target.save();
    await Audit.create({
      actorId: p.userId,
      action: suspended ? "user.suspended" : "user.restored",
      targetId: String(target._id),
      detail: reason,
    });
    res.json({ ok: true });
  });
  app.patch("/api/v1/admin/appeals/:id", async (req: AuthedRequest, res) => {
    const p = admin(req);
    const { state } = z
      .object({ state: z.enum(["accepted", "declined"]) })
      .parse(req.body);
    const appeal = await Appeal.findById(id(req.params.id));
    if (!appeal) return fail(404, "Appeal not found.");
    appeal.state = state;
    await appeal.save();
    if (state === "accepted")
      await ProfileModel.updateOne(
        { userId: appeal.userId },
        { suspended: false },
      );
    await Audit.create({
      actorId: p.userId,
      action: `appeal.${state}`,
      targetId: String(appeal._id),
    });
    res.json({ ok: true });
  });
  app.get("/api/v1/openapi.json", (_req, res) =>
    res.json(openApiDocument(app, origin)),
  );
  app.use((_req, _res, next) =>
    next(new HttpError(404, "That page isn’t here.")),
  );
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: error.issues[0]?.message || "Check your input.",
        fields: error.flatten(),
      });
    if (error.code === "23505")
      return res.status(409).json({
        error: "That name or request is already in use. Refresh and try again.",
      });
    if (error.type === "entity.too.large")
      return res.status(413).json({ error: "That post is a little too long." });
    if (error.code === "LIMIT_FILE_SIZE")
      return res
        .status(413)
        .json({ error: "Choose an image smaller than 2 MB." });
    const status =
      error.status >= 400 && error.status <= 599 ? error.status : 500;
    if (status === 500) console.error(error);
    res.status(status).json({
      error:
        status === 500
          ? "Something didn’t go through. Your draft is still here. Please try again."
          : error.message,
    });
  });
  return app;
}
