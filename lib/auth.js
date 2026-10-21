import { randomBytes } from "node:crypto";

export function createAuth({ env = process.env, request = fetch, now = Date.now } = {}) {
  const required = env.NODE_ENV === "production" || env.AUTH_REQUIRED === "true";
  const secure = env.NODE_ENV === "production";
  const signupEnabled = env.SELF_SIGNUP_ENABLED === "true";
  const cookieName = secure ? "__Host-basketball_session" : "basketball_session";
  const allowed = new Set((env.ALLOWED_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean));
  const base = env.SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const sessions = new Map();
  let attempts = [];
  const configured = Boolean(base && key && (signupEnabled || allowed.size));
  const permitted = email => signupEnabled || allowed.has(email);
  const cookie = (value, age) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;
  const sessionId = req => (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  function user(req) {
    const id = sessionId(req);
    const session = sessions.get(id);
    if (!session || session.expires <= now() || !permitted(session.email)) {
      if (id) sessions.delete(id);
      return null;
    }
    return { email: session.email };
  }
  async function login(email, password) {
    attempts = attempts.filter(time => now() - time < 60_000);
    if (attempts.length >= 20) return { status: 429, error: "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요." };
    attempts.push(now());
    email = String(email || "").trim().toLowerCase();
    if (!configured) return { status: 503, error: "로그인 설정을 준비 중입니다." };
    if (!permitted(email) || typeof password !== "string" || !password) return { status: 401, error: "이메일 또는 비밀번호를 확인해 주세요." };
    try {
      const response = await request(`${base}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { apikey: key, "content-type": "application/json" },
        body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) return { status: 401, error: "이메일 또는 비밀번호를 확인해 주세요." };
      const tokens = await response.json();
      if (!tokens.access_token) throw new Error("Missing token");
      const verification = await request(`${base}/auth/v1/user`, {
        headers: { apikey: key, authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10_000)
      });
      if (!verification.ok) throw new Error("Invalid session");
      const account = await verification.json();
      if (!account.email_confirmed_at || account.email?.toLowerCase() !== email) return { status: 403, error: "이메일 인증을 완료해 주세요." };
      for (const [id, session] of sessions) if (session.expires <= now()) sessions.delete(id);
      if (sessions.size >= 1000) return { status: 503, error: "잠시 후 다시 시도해 주세요." };
      const id = randomBytes(32).toString("hex");
      const age = Math.min(3600, Math.max(1, Number(tokens.expires_in) || 3600));
      sessions.set(id, { email, expires: now() + age * 1000 });
      return { status: 200, cookie: cookie(id, age), user: { email } };
    } catch { return { status: 503, error: "로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." }; }
  }
  async function signup(email, password) {
    if (!signupEnabled) return { status: 403, error: "현재 회원가입을 받지 않고 있습니다." };
    if (!configured) return { status: 503, error: "회원가입 설정을 준비 중입니다." };
    attempts = attempts.filter(time => now() - time < 60_000);
    if (attempts.length >= 20) return { status: 429, error: "요청이 많습니다. 잠시 후 다시 시도해 주세요." };
    attempts.push(now());
    email = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== "string" || password.length < 8 || password.length > 128) {
      return { status: 400, error: "올바른 이메일과 8~128자의 비밀번호를 입력해 주세요." };
    }
    try {
      // Only create new accounts. Never update/confirm an existing account by email.
      const response = await request(`${base}/auth/v1/admin/users`, {
        method: "POST", headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ email, password, email_confirm: true }), signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) return { status: response.status === 429 ? 429 : 400, error: "가입하지 못했습니다. 이미 가입한 이메일이면 로그인해 주세요. 비밀번호는 8자 이상으로 입력해 주세요." };
      const result = await login(email, password);
      if (result.error) result.error = "가입은 완료됐습니다. 잠시 후 로그인해 주세요.";
      return result;
    } catch { return { status: 503, error: "가입 결과를 확인하지 못했습니다. 잠시 후 로그인을 시도해 주세요." }; }
  }
  function logout(req) { sessions.delete(sessionId(req)); return cookie("", 0); }
  return { required, configured, signupEnabled, user, login, signup, logout };
}
