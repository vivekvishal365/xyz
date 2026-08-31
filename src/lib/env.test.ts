import { describe, expect, it } from "vitest";
import { schemas } from "./env";

/**
 * §39 is an architectural constraint, so it gets a test rather than a comment.
 * The one that matters is the last: no secret may live in the public schema,
 * because everything in it is inlined into the client bundle.
 */
describe("public env schema", () => {
  it("requires a valid Supabase URL", () => {
    const result = schemas.publicSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "key",
    });
    expect(result.success).toBe(false);
  });

  it("defaults the site URL for local development", () => {
    const result = schemas.publicSchema.parse({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "key",
    });
    expect(result.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
  });

  it("contains no secret-looking keys", () => {
    const publicKeys = Object.keys(schemas.publicSchema.shape);

    // Everything in the public schema is inlined into the client bundle.
    for (const key of publicKeys) {
      expect(key.startsWith("NEXT_PUBLIC_")).toBe(true);
      expect(key).not.toMatch(/SERVICE_ROLE|SECRET|PRIVATE|_API_KEY$/);
    }
  });
});

describe("auth bypass flag", () => {
  const base = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "key",
  };

  it("is off when unset", () => {
    expect(schemas.publicSchema.parse(base).NEXT_PUBLIC_AUTH_BYPASS).toBe("false");
  });

  it("is on only for exactly \"true\"", () => {
    expect(
      schemas.publicSchema.parse({ ...base, NEXT_PUBLIC_AUTH_BYPASS: "true" })
        .NEXT_PUBLIC_AUTH_BYPASS,
    ).toBe("true");
  });

  it("falls back to off for anything malformed, rather than throwing", () => {
    // The failure mode of a typo must be "authentication stays on".
    for (const value of ["TRUE", "1", "yes", "on", "", "maybe"]) {
      expect(
        schemas.publicSchema.parse({ ...base, NEXT_PUBLIC_AUTH_BYPASS: value })
          .NEXT_PUBLIC_AUTH_BYPASS,
      ).toBe("false");
    }
  });
});

describe("server env schema", () => {
  it("requires the service role key", () => {
    expect(schemas.serverSchema.safeParse({}).success).toBe(false);
  });

  it("keeps the service role key out of anything public", () => {
    expect(Object.keys(schemas.serverSchema.shape)).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(Object.keys(schemas.publicSchema.shape)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
