import { createAuthClient } from "better-auth/react";

// Authentication is loaded by account and moderator sign-in actions.
export const authClient = createAuthClient({ basePath: "/api/v1/auth" });
