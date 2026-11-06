import type { Express, Request } from "express";
import multer from "multer";
import sharp from "sharp";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Media, IdeaModel } from "./models.js";

export function installMedia(
  app: Express,
  member: (req: any) => any,
  blockedIds: (req: any) => Promise<string[]>,
) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) =>
      cb(
        null,
        ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype),
      ),
  });
  const s3 = process.env.S3_BUCKET
    ? new S3Client({
        endpoint: process.env.S3_ENDPOINT || undefined,
        region: process.env.S3_REGION || "auto",
        forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      })
    : null;
  app.post(
    "/api/v1/media",
    (req, _res, next) => {
      member(req);
      next();
    },
    upload.single("image"),
    async (req, res) => {
      const person = member(req);
      if (!req.file)
        return res
          .status(400)
          .json({ error: "Choose a JPEG, PNG, or WebP image under 2 MB." });
      let normalized: Buffer;
      try {
        const image = sharp(req.file.buffer, {
          limitInputPixels: 24000000,
          failOn: "warning",
        });
        const metadata = await image.metadata();
        if (
          !["jpeg", "png", "webp"].includes(metadata.format || "") ||
          (metadata.pages || 1) > 1
        )
          throw new Error("Unsupported image.");
        normalized = await image
          .rotate()
          .resize({
            width: 1400,
            height: 1000,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 82 })
          .toBuffer();
      } catch {
        return res.status(400).json({
          error:
            "That file isn’t a supported still image. Try a smaller JPEG, PNG, or WebP.",
        });
      }
      const key = `${randomUUID()}.webp`;
      const storage = s3 ? "s3" : "local";
      if (s3)
        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.S3_BUCKET!,
            Key: key,
            Body: normalized,
            ContentType: "image/webp",
          }),
        );
      else {
        await mkdir(resolve(".data/uploads"), { recursive: true });
        await writeFile(resolve(".data/uploads", key), normalized);
      }
      const media = await Media.create({
        ownerId: person.userId,
        key,
        storage,
        bytes: normalized.length,
        contentType: "image/webp",
      });
      res
        .status(201)
        .json({ id: String(media._id), url: `/api/v1/media/${media._id}` });
    },
  );
  app.get("/api/v1/media/:id", async (req: Request & { member?: any }, res) => {
    if (!/^[a-f0-9]{24}$/i.test(String(req.params.id)))
      return res.status(404).end();
    const media = await Media.findById(req.params.id);
    if (!media) return res.status(404).end();
    if (
      media.ownerId !== req.member?.userId &&
      !(await IdeaModel.exists({
        coverImage: String(media._id),
        status: "published",
        deletedAt: null,
        authorId: { $nin: await blockedIds(req) },
      }))
    )
      return res.status(404).end();
    const buffer =
      media.storage === "s3" && s3
        ? Buffer.from(
            await (
              await s3.send(
                new GetObjectCommand({
                  Bucket: process.env.S3_BUCKET!,
                  Key: media.key,
                }),
              )
            ).Body!.transformToByteArray(),
          )
        : await readFile(resolve(".data/uploads", media.key));
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.send(buffer);
  });
}
