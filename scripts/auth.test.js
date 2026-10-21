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

test("signup is disabled unless explicitly enabled", async () => {
  const auth = createAuth({ env, request: () => { throw new Error('Unexpected request'); } });
  assert.equal((await auth.signup('new@example.com', 'password123')).status, 403);
});

test("public signup creates a confirmed account and immediately establishes a session", async () => {
  const calls = [];
  const auth = createAuth({ env: {...env, SELF_SIGNUP_ENABLED:'true', ALLOWED_EMAILS:''}, request: async (url, options) => {
    calls.push({url, body: options.body && JSON.parse(options.body)});
    if (url.endsWith('/admin/users')) return new Response('{}');
    if (url.includes('/token?')) return new Response(JSON.stringify({access_token:'new-token', expires_in:3600}));
    return new Response(JSON.stringify({email:'new@example.com',email_confirmed_at:'2026-10-21'}));
  }});
  const result = await auth.signup('NEW@example.com','password123');
  assert.equal(result.status,200);
  assert.equal(calls[0].body.email_confirm,true);
  assert.equal(calls[0].body.email,'new@example.com');
  assert.equal(auth.user({headers:{cookie:result.cookie.split(';')[0]}}).email,'new@example.com');
});

test("invalid or duplicate signup cannot log in or modify an existing account", async () => {
  let requests = 0;
  const auth = createAuth({env:{...env,SELF_SIGNUP_ENABLED:'true'},request:async url => {
    requests++;
    assert.ok(url.endsWith('/admin/users'));
    return new Response('{}',{status:422});
  }});
  assert.equal((await auth.signup('bad','short')).status,400);
  assert.equal(requests,0);
  const result=await auth.signup('owner@example.com','password123');
  assert.equal(result.status,400);
  assert.equal(result.cookie,undefined);
  assert.equal(requests,1);
});
