import { z } from "zod";

export const categories = [
  "All ideas",
  "Tech",
  "Local business",
  "Design",
  "Life & living",
  "Wild idea",
] as const;
export const stages = [
  "Just an idea",
  "Getting roasted",
  "Validating",
  "Building",
  "Beta",
  "Launched",
] as const;
export const tones = ["Light", "Honest", "Savage"] as const;
const reservedCoffeePaths = new Set([
  "signup",
  "login",
  "logout",
  "about",
  "terms",
  "privacy",
  "settings",
  "dashboard",
  "support",
  "help",
  "explore",
  "signupsuccess",
]);
export const buyMeACoffeeUrlSchema = z
  .string()
  .trim()
  .max(300)
  .transform((value) =>
    /^(?:www\.)?buymeacoffee\.com\//i.test(value) ? `https://${value}` : value,
  )
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      const slug = url.pathname.replace(/^\//, "").replace(/\/$/, "");
      return (
        url.protocol === "https:" &&
        ["buymeacoffee.com", "www.buymeacoffee.com"].includes(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.port &&
        /^[a-z0-9][a-z0-9_.-]{0,79}$/i.test(slug) &&
        !reservedCoffeePaths.has(slug.toLowerCase())
      );
    } catch {
      return false;
    }
  }, "Use your creator page, such as https://buymeacoffee.com/yourname.")
  .transform((value) =>
    value
      ? `https://buymeacoffee.com/${new URL(value).pathname.replace(/^\//, "").replace(/\/$/, "")}`
      : "",
  );
export const communityConfigSchema = z.object({
  publishingEnabled: z.boolean(),
  coffeeEnabled: z.boolean(),
  categories: z
    .array(
      z.enum([
        "Tech",
        "Local business",
        "Design",
        "Life & living",
        "Wild idea",
      ]),
    )
    .min(1)
    .max(5),
  coffeePresets: z
    .array(z.number().int().min(49).max(5000))
    .min(1)
    .max(4)
    .refine(
      (values) => new Set(values).size === values.length,
      "Choose different preset amounts.",
    ),
});
export type CommunityConfig = z.infer<typeof communityConfigSchema>;
export const defaultCommunityConfig: CommunityConfig = {
  publishingEnabled: true,
  coffeeEnabled: true,
  categories: [
    "Tech",
    "Local business",
    "Design",
    "Life & living",
    "Wild idea",
  ],
  coffeePresets: [49, 99, 199],
};
export const ideaSchema = z.object({
  creatorName: z.string().trim().max(60).optional(),
  buyMeACoffeeUrl: buyMeACoffeeUrlSchema.default(""),
  title: z
    .string()
    .trim()
    .min(8, "Give your idea a little more detail.")
    .max(140),
  pitch: z
    .string()
    .trim()
    .min(30, "Tell us the idea in at least 30 characters.")
    .max(1000),
  problem: z.string().trim().max(3000).default(""),
  solution: z.string().trim().max(3000).default(""),
  audience: z.string().trim().max(500).default(""),
  category: z.enum([
    "Tech",
    "Local business",
    "Design",
    "Life & living",
    "Wild idea",
  ]),
  stage: z.enum(stages).default("Getting roasted"),
  tone: z.enum(tones).default("Honest"),
  visibility: z.enum(["public", "unlisted"]).default("public"),
  status: z.enum(["draft", "published", "archived"]).default("published"),
  prototype: z
    .union([
      z.literal(""),
      z
        .url()
        .refine((v) => /^https?:\/\//i.test(v), "Use an http or https link."),
    ])
    .default(""),
  tags: z.array(z.string().trim().min(1).max(24)).max(5).default([]),
  coverImage: z
    .string()
    .regex(/^[a-f0-9]{24}$/)
    .optional(),
});
export const roastSchema = z.object({
  tone: z.enum(tones),
  critique: z.string().trim().min(12).max(2000),
  suggestion: z.string().trim().min(12).max(1500),
  punchline: z.string().trim().max(240).default(""),
});
export const improvementSchema = z.object({
  body: z.string().trim().min(12).max(2000),
  category: z.enum([
    "Product",
    "Marketing",
    "Feasibility",
    "Business model",
    "User experience",
    "Distribution",
  ]),
});
export const experimentSchema = z.object({
  hypothesis: z.string().trim().min(8).max(240),
  experiment: z.string().trim().min(12).max(1500),
  successCriteria: z.string().trim().min(5).max(300),
});
export const experimentProgressSchema = z.object({
  status: z.enum(["Planned", "In progress", "Complete", "Inconclusive"]),
  outcome: z.string().trim().max(1000).optional(),
});
export const profileSchema = z.object({
  name: z.string().trim().min(2).max(60),
  username: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9_]{3,24}$/,
      "Use 3–24 lowercase letters, numbers or underscores.",
    ),
  bio: z.string().trim().max(350),
  skills: z.array(z.string().trim().min(1).max(30)).max(8),
  website: z.union([
    z.literal(""),
    z.url().refine((v) => /^https?:\/\//i.test(v)),
  ]),
  private: z.boolean().default(false),
});
export const coffeeSchema = z.object({
  amount: z.number().int().min(49).max(5000),
  message: z.string().trim().max(500).default(""),
  private: z.boolean().default(false),
});
export type IdeaInput = z.infer<typeof ideaSchema>;
export type Profile = {
  id: string;
  userId: string;
  name: string;
  username: string;
  bio: string;
  skills: string[];
  website: string;
  private: boolean;
  demo: boolean;
  color: string;
  role?: string;
};
export type Idea = IdeaInput & {
  id: string;
  authorId: string;
  author: Profile;
  createdAt: string;
  updatedAt: string;
  demo: boolean;
  cover: string;
  interests: number;
  roastCount: number;
  saved: boolean;
  interested: boolean;
  following: boolean;
  version: number;
};
export type Roast = {
  id: string;
  ideaId: string;
  authorId: string;
  author: Profile;
  tone: (typeof tones)[number];
  critique: string;
  suggestion: string;
  punchline: string;
  helpful: number;
  voted: boolean;
  acknowledged: boolean;
  createdAt: string;
  replies: { id: string; author: Profile; body: string; createdAt: string }[];
};
export type Suggestion = {
  id: string;
  author: Profile;
  body: string;
  category: string;
  state: string;
  createdAt: string;
};
export type Milestone = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  stage: string;
  selfReported: boolean;
  kind?: "update" | "experiment";
  hypothesis?: string;
  successCriteria?: string;
  status?: "Planned" | "In progress" | "Complete" | "Inconclusive";
  outcome?: string;
};
export type FeedbackSummary = {
  roastCount: number;
  helpfulVotes: number;
  suggestionCount: number;
  implementedSuggestions: number;
  suggestionCategories: { category: string; count: number }[];
};
export type Order = {
  id: string;
  amount: number;
  currency: string;
  state: string;
  mode: string;
  message: string;
  private: boolean;
  creatorName?: string;
  createdAt: string;
};
export type Detail = {
  idea: Idea;
  roasts: Roast[];
  improvements: Suggestion[];
  milestones: Milestone[];
  feedbackSummary: FeedbackSummary | null;
  supporters: { id: string; message: string; name: string }[];
  revisions: {
    id: string;
    version: number;
    title: string;
    createdAt: string;
  }[];
};
export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
export function money(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
