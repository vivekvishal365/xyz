import { z } from "zod";

/**
 * Environment validation (§39).
 *
 * Two separate schemas, deliberately. `publicEnv` holds values that are inlined
 * into the client bundle; `serverEnv` holds secrets and is only ever read from
 * server code. Keeping them apart makes the boundary reviewable — if a secret
 * ever shows up in the public schema, that is a visible mistake in a diff
 * rather than an invisible leak in a bundle.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  // TEMPORARY — see src/lib/auth/bypass.ts. `.catch` rather than plain
  // `.default` on purpose: a mistyped value ("TRUE", "1", "yes") must fall back
  // to auth-on, not throw and not accidentally enable the bypass.
  NEXT_PUBLIC_AUTH_BYPASS: z.enum(["true", "false"]).default("false").catch("false"),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function format(error: z.ZodError): string {
  return error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
}

/**
 * Parse public env. Referenced with literal property access so Next can inline
 * the values at build time — `process.env[someVariable]` is not replaced.
 */
export function parsePublicEnv(): PublicEnv {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_AUTH_BYPASS: process.env.NEXT_PUBLIC_AUTH_BYPASS,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment variables:\n${format(parsed.error)}\n\n` +
        `Copy .env.example to .env.local and fill in the values.`,
    );
  }
  return parsed.data;
}

/**
 * Parse server env. Throws if called from the browser — a loud failure beats a
 * silently shipped secret.
 */
export function parseServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("parseServerEnv() was called in the browser. Server env is secret.");
  }

  const parsed = serverSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NODE_ENV: process.env.NODE_ENV,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${format(parsed.error)}\n\n` +
        `Copy .env.example to .env.local and fill in the values.`,
    );
  }
  return parsed.data;
}

/** Exported for tests so the rules can be asserted without a real environment. */
export const schemas = { publicSchema, serverSchema };
