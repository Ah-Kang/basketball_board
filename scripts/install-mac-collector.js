import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

if (process.platform !== "darwin") throw new Error("macOS only");
const root = resolve(process.argv[2] || process.cwd());
const label = "com.basketball-board.collector";
const agentDir = join(homedir(), "Library", "LaunchAgents");
const plistPath = join(agentDir, label + ".plist");
const escape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const args = [process.execPath, "--env-file=" + join(root, ".env"), join(root, "scripts/naver-cafe-scraper.js"), "--headless", "--non-interactive"];
mkdirSync(agentDir, { recursive: true });
mkdirSync(join(root, "data"), { recursive: true });
writeFileSync(plistPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${args.map(arg => "<string>" + escape(arg) + "</string>").join("")}</array>
<key>WorkingDirectory</key><string>${escape(root)}</string>
<key>StartInterval</key><integer>300</integer>
<key>RunAtLoad</key><true/>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${escape(join(root, "data", "mac-collector.log"))}</string>
<key>StandardErrorPath</key><string>${escape(join(root, "data", "mac-collector.log"))}</string>
</dict></plist>\n`, { mode: 0o600 });
const domain = "gui/" + process.getuid();
try { execFileSync("launchctl", ["bootout", domain + "/" + label], { stdio: "ignore" }); } catch {}
execFileSync("launchctl", ["bootstrap", domain, plistPath]);
console.log("Mac collector installed: every 300 seconds while logged in and awake.");
