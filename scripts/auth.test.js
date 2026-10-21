import test from "node:test";
import assert from "node:assert/strict";
import { createAuth } from "../lib/auth.js";

const env = { NODE_ENV: "production", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only", ALLOWED_EMAILS: "owner@example.com" };
const mock = async url => new Response(JSON.stringify(url.includes("/token?") ? { access_token: "test-token", expires_in: 60 } : { email: "owner@example.com", email_confirmed_at: "2026-10-21" }), { status: 200 });
test("production is private even without settings", () => {
  const auth = createAuth({ env: { NODE_ENV: "production" } });
  assert.equal(auth.required, true);
  assert.equal(auth.configured, false);
  assert.equal(auth.user({ headers: {} }), null);
});
test("uninvited users cannot authenticate", async () => {
  const auth = createAuth({ env, request: () => { throw new Error("Should not contact auth provider"); } });
  assert.equal((await auth.login("stranger@example.com", "test")).status, 401);
});
test("verified login uses secure opaque cookies; expires and logs out", async () => {
  let time = 0;
  const auth = createAuth({ env, request: mock, now: () => time });
  const result = await auth.login("OWNER@example.com", "test");
  assert.equal(result.status, 200);
  assert.match(result.cookie, /HttpOnly; SameSite=Strict; Max-Age=60; Secure/);
  assert.doesNotMatch(result.cookie, /test-token/);
  const req = { headers: { cookie: result.cookie.split(";")[0] } };
  assert.equal(auth.user(req).email, "owner@example.com");
  time = 60_001;
  assert.equal(auth.user(req), null);
  const second = await auth.login("owner@example.com", "test");
  const nextReq = { headers: { cookie: second.cookie.split(";")[0] } };
  assert.match(auth.logout(nextReq), /Max-Age=0/);
  assert.equal(auth.user(nextReq), null);
});
test("forged cookies, wrong passwords and unconfirmed users are denied", async () => {
  const auth = createAuth({ env, request: async () => new Response("{}", { status: 400 }) });
  assert.equal(auth.user({ headers: { cookie: "__Host-basketball_session=forged" } }), null);
  assert.equal((await auth.login("owner@example.com", "wrong")).status, 401);
  const unconfirmed = createAuth({ env, request: async url => new Response(JSON.stringify(url.includes("/token?") ? {access_token: "test"} : {email: "owner@example.com"})) });
  assert.equal((await unconfirmed.login("owner@example.com", "test")).status, 403);
});
test("login retries are bounded", async () => {
  const auth = createAuth({ env, request: mock });
  for (let i=0; i<20; i++) await auth.login("unknown@example.com", "wrong");
  assert.equal((await auth.login("unknown@example.com", "wrong")).status, 429);
});
