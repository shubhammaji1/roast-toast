import { createAuthClient } from "better-auth/react";

// Moderator authentication is loaded only by account/sign-in actions.
export const authClient = createAuthClient({ basePath: "/api/v1/auth" });
