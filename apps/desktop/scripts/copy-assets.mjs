import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const repoRoot = path.resolve(desktopRoot, "../..");
const src = path.join(repoRoot, "assets");
const dest = path.join(desktopRoot, "dist", "assets");
fs.cpSync(src, dest, { recursive: true });

const rendererSrc = path.join(desktopRoot, "src", "renderer");
const rendererDest = path.join(desktopRoot, "dist", "renderer");
fs.cpSync(rendererSrc, rendererDest, { recursive: true });
