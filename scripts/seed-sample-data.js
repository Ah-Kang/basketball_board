import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const target = join(process.cwd(), "data", "events.json");

mkdirSync(dirname(target), { recursive: true });

if (!existsSync(target)) {
  writeFileSync(target, "[]\n");
}

console.log(`Sample events ready: ${target}`);
