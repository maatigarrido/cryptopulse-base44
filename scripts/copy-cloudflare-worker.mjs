import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source = resolve("cloudflare-worker.js");
const target = resolve("dist/_worker.js");

if (!existsSync(source)) {
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log("Copied Cloudflare Pages worker to dist/_worker.js");
