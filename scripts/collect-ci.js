import { mkdtempSync, writeFileSync, copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Public Actions logs must never contain cookie values, article bodies, or contacts.
let scratch;
let createdConfig = false;
const configPath = join(process.cwd(), 'config', 'cafes.json');
try {
  for (const key of ['CAFE_COOKIES_JSON', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!process.env[key]) throw new Error('Required secret missing');
  }
  const cookies = JSON.parse(process.env.CAFE_COOKIES_JSON);
  if (!Array.isArray(cookies) || !cookies.length || cookies.some(c =>
    !c || typeof c.name !== 'string' || typeof c.value !== 'string' || typeof c.domain !== 'string')) {
    throw new Error('Invalid cookies');
  }
  scratch = mkdtempSync(join(tmpdir(), 'basketball-collector-'));
  writeFileSync(join(scratch, 'auth-default-cookies.json'), JSON.stringify(cookies), { mode: 0o600 });
  if (!existsSync(configPath)) {
    copyFileSync(join(process.cwd(), 'config', 'cafes.example.json'), configPath);
    createdConfig = true;
  }
  const childEnv = { ...process.env, APP_DATA_DIR: scratch, SCRAPER_USER_ID: 'default',
    SCRAPER_HEADLESS: 'true', SCRAPER_NONINTERACTIVE: 'true', SCRAPER_ACCESS_MODE: 'authenticated' };
  delete childEnv.CAFE_COOKIES_JSON;
  const result = spawnSync(process.execPath, ['scripts/naver-cafe-scraper.js'], {
    env: childEnv, stdio: 'ignore', timeout: 15 * 60 * 1000, killSignal: 'SIGKILL'
  });
  if (result.error || result.status !== 0) throw new Error('Collection failed');
  const events = JSON.parse(readFileSync(join(scratch, 'events.json'), 'utf8'));
  if (!Array.isArray(events) || !events.length) throw new Error('No events collected');
  console.log(`Collection completed: ${events.length} events saved.`);
} catch {
  console.error('Collection failed. Check configured secrets, cafe session validity, and Supabase access. Sensitive output is suppressed.');
  process.exitCode = 1;
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  if (createdConfig) rmSync(configPath, { force: true });
}
