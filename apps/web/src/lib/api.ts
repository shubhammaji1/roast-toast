import { createAuthClient } from "better-auth/react";
import type { Profile } from "@roast/domain";

export const API_BASE_PATH = "/api/v1";
export const authClient = createAuthClient({
  basePath: `${API_BASE_PATH}/auth`,
});
export type Me = {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    anonymous?: boolean;
  } | null;
  profile: Profile | null;
  demo: boolean;
  google: boolean;
  payments: string;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: {
      formErrors?: string[];
      fieldErrors?: Record<string, string[] | undefined>;
    },
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (
    init?.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE_PATH}${path}`, {
    ...init,
    credentials: "same-origin",
    headers,
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => {
    throw new ApiError(
      response.ok ? 502 : response.status,
      "The café is temporarily unavailable. Please try again in a moment.",
    );
  });
  if (!response.ok)
    throw new ApiError(
      response.status,
      typeof data?.error === "string"
        ? data.error
        : "Something didn’t go through. Try again.",
      data?.fields,
    );
  return data;
}
export const send = <T>(path: string, body: unknown, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(body) });
export function date(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
