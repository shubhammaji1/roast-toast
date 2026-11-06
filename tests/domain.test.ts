import { describe, it, expect } from "vitest";
import {
  ideaSchema,
  roastSchema,
  coffeeSchema,
  profileSchema,
  buyMeACoffeeUrlSchema,
} from "../packages/domain/src/index";
const pitch = {
  title: "A useful neighborhood tool library",
  pitch:
    "A tool sharing service for apartment residents who only need a drill once.",
  category: "Local business",
};
describe("Input contracts", () => {
  it.each([
    "javascript:alert(1)",
    "http://buymeacoffee.com/test",
    "https://buymeacoffee.com.evil.test/test",
    "https://evil.test/test",
    "https://buymeacoffee.com/signup",
    "https://buymeacoffee.com/a/b",
    "https://user:password@buymeacoffee.com/test",
    "buymeacoffee.com.evil.test/test",
    "buymeacoffee.com@evil.test/test",
    "https://buymeacoffee.com:8443/test",
  ])("rejects unsafe creator link %s", (url) => {
    expect(buyMeACoffeeUrlSchema.safeParse(url).success).toBe(false);
  });
  it("normalizes creator support URLs and permits no link", () => {
    expect(
      buyMeACoffeeUrlSchema.parse(
        " https://www.buymeacoffee.com/testmaker/?ref=idea ",
      ),
    ).toBe("https://buymeacoffee.com/testmaker");
    expect(ideaSchema.parse(pitch).buyMeACoffeeUrl).toBe("");
  });
  it.each([
    "https://buymeacoffee.com/BeyondTheSyntax",
    "buymeacoffee.com/BeyondTheSyntax",
    " www.buymeacoffee.com/BeyondTheSyntax/?ref=profile ",
  ])("preserves creator capitalization and accepts copied URL %s", (url) => {
    expect(buyMeACoffeeUrlSchema.parse(url)).toBe(
      "https://buymeacoffee.com/BeyondTheSyntax",
    );
  });
  it("trims a pitch and applies safe defaults", () => {
    const input = ideaSchema.parse({ ...pitch, title: ` ${pitch.title} ` });
    expect(input.title).toBe(pitch.title);
    expect(input.visibility).toBe("public");
    expect(input.tags).toEqual([]);
  });
  it.each(["javascript:alert(1)", "data:text/html,bad", "file:///etc/passwd"])(
    "rejects executable prototype link %s",
    (prototype) => {
      expect(ideaSchema.safeParse({ ...pitch, prototype }).success).toBe(false);
    },
  );
  it("requires critique and a constructive next step", () => {
    expect(
      roastSchema.safeParse({
        tone: "Savage",
        critique: "This assumption is too broad.",
        suggestion: "",
      }).success,
    ).toBe(false);
    expect(
      roastSchema.safeParse({
        tone: "Honest",
        critique: "This assumption is too broad.",
        suggestion: "Start by interviewing five actual residents.",
      }).success,
    ).toBe(true);
  });
  it.each([0, 48, 49.5, 5001, Infinity, NaN])(
    "rejects unsupported coffee amount %s",
    (amount) => {
      expect(coffeeSchema.safeParse({ amount }).success).toBe(false);
    },
  );
  it("rejects usernames that could become path segments", () => {
    expect(
      profileSchema.safeParse({
        name: "Test User",
        username: "../admin",
        bio: "",
        skills: [],
        website: "",
        private: false,
      }).success,
    ).toBe(false);
  });
});
