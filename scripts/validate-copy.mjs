import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function displayWidth(s) {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 0x2e7f || (code >= 0x4e00 && code <= 0x9fff)) w += 1;
    else if (/\s/.test(ch)) w += 0;
    else w += 0.5;
  }
  return w;
}

function check(file) {
  const items = JSON.parse(fs.readFileSync(file, "utf8"));
  let ok = true;
  for (const item of items) {
    const w1 = displayWidth(item.line1 ?? "");
    const w2 = displayWidth(item.line2 ?? "");
    if (w1 > 10 || w2 > 10) {
      console.error(`FAIL ${file}: "${item.line1}" / "${item.line2}" (${w1}, ${w2})`);
      ok = false;
    }
  }
  return ok;
}

const copyDir = path.join(root, "content/copy");
const a = check(path.join(copyDir, "jokes.json"));
const b = check(path.join(copyDir, "states.json"));
process.exit(a && b ? 0 : 1);
