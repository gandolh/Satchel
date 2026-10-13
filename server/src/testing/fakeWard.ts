import { generateKeyPairSync } from "node:crypto";

/**
 * A stand-in for Ward's HTTP surface, as a `fetch` for `createWardClient`:
 * the discovery document, and `POST /session-status` (the 30-second check).
 * No socket is opened. It does not run the code flow; the tests that need a
 * session that began with Ward start one directly (`TestApp.signInWithWard`).
 *
 * `createWardClient` validates its key at boot, so the client key is a real
 * Ed25519 key made here, never one from the repository or the environment.
 */

export const FAKE_ISSUER = "http://127.0.0.1:9/ward-api/oidc";
export const FAKE_WARD_API = "http://127.0.0.1:9/ward-api";

/** A fresh `WARD_OIDC_CLIENT_KEY` value: base64url of a private Ed25519 JWK with a `kid`. */
export function newClientKey(): string {
  const { privateKey } = generateKeyPairSync("ed25519");
  const jwk = { ...privateKey.export({ format: "jwk" }), kid: "test-key" };
  return Buffer.from(JSON.stringify(jwk)).toString("base64url");
}

export interface FakeWard {
  fetch: typeof fetch;
  /** Mark a Ward session (by `wardSid`) live or ended. Unknown sessions are ended. */
  setSession(wardSid: string, active: boolean): void;
  /** Ward stops answering (a network error) until set back to false. */
  down: boolean;
  /** Ward answers 401: it refuses this app's client credential. */
  refuseClient: boolean;
  /** How many `session-status` calls were made. */
  readonly statusCalls: number;
  /** The paths asked of the fake, in order. */
  readonly requests: string[];
}

export function createFakeWard(): FakeWard {
  const live = new Set<string>();
  const requests: string[] = [];
  let statusCalls = 0;

  const fake: FakeWard = {
    down: false,
    refuseClient: false,
    get statusCalls() {
      return statusCalls;
    },
    requests,
    setSession(wardSid, active) {
      if (active) live.add(wardSid);
      else live.delete(wardSid);
    },
    async fetch(input, init) {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      requests.push(`${init?.method ?? "GET"} ${url.pathname}`);
      if (fake.down) throw new TypeError("fetch failed");

      if (url.pathname === "/ward-api/oidc/.well-known/openid-configuration") {
        return Response.json({
          issuer: FAKE_ISSUER,
          authorization_endpoint: `${FAKE_ISSUER}/auth`,
          token_endpoint: `${FAKE_ISSUER}/token`,
          jwks_uri: `${FAKE_ISSUER}/jwks`,
          end_session_endpoint: `${FAKE_ISSUER}/session/end`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["EdDSA"],
          token_endpoint_auth_methods_supported: ["private_key_jwt"],
          token_endpoint_auth_signing_alg_values_supported: ["EdDSA"],
          code_challenge_methods_supported: ["S256"],
        });
      }
      if (url.pathname === "/ward-api/session-status" && init?.method === "POST") {
        statusCalls += 1;
        if (fake.refuseClient) return Response.json({ error: "invalid_client" }, { status: 401 });
        const body = JSON.parse(String(init.body)) as { wardSid: string };
        return Response.json(live.has(body.wardSid) ? { active: true, role: "member" } : { active: false });
      }
      return new Response("not found", { status: 404 });
    },
  };
  return fake;
}
