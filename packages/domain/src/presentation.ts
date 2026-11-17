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
