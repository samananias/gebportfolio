/* global console, process */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT_DIR, "src");

let violations = [];

// Helper: Recursively get all files in a directory
function getFiles(dir, extFilter = null) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const itemPath = path.join(dir, item);
    // Ignore node_modules, .git, and _archive
    if (item === "node_modules" || item === ".git" || item === "_archive" || item === ".astro") {
      continue;
    }
    const stat = fs.statSync(itemPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(itemPath, extFilter));
    } else {
      if (!extFilter || extFilter.some((ext) => item.endsWith(ext))) {
        results.push(itemPath);
      }
    }
  }
  return results;
}

// 1. Guard: Never create tailwind.config.*
const BANNED_TAILWIND_CONFIGS = [
  "tailwind.config.js",
  "tailwind.config.cjs",
  "tailwind.config.mjs",
  "tailwind.config.ts",
];
for (const configName of BANNED_TAILWIND_CONFIGS) {
  const fullPath = path.join(ROOT_DIR, configName);
  if (fs.existsSync(fullPath)) {
    violations.push({
      file: configName,
      line: 1,
      rule: "Tailwind v4 is CSS-first in src/styles/global.css via @theme. Do not create tailwind.config.*",
    });
  }
}

// 2. Guard: No system text emojis in UI or code (use <DoodleIcon> SVGs instead)
// Covers standard emoji planes: Pictographs, Emoticons, Transport, Supplemental, Extended-A
const EMOJI_REGEX =
  /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;

const srcCodeFiles = getFiles(SRC_DIR, [".astro", ".tsx", ".ts", ".css"]);
for (const file of srcCodeFiles) {
  const relPath = path.relative(ROOT_DIR, file);
  const content = fs.readFileSync(file, "utf-8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (EMOJI_REGEX.test(line)) {
      violations.push({
        file: relPath,
        line: idx + 1,
        rule: `System text emoji found. Use <DoodleIcon> SVGs instead. Content: "${line.trim()}"`,
      });
    }
  });
}

// 3. Guard: No CSS gradients (linear, radial, conic) except permitted textures
const GRADIENT_REGEX =
  /\b(repeating-)?(linear|radial|conic)-gradient\(|bg-gradient-(to-[a-z]+|[a-z]+)/i;
const PERMITTED_GRADIENT_FILES = [
  path.join(SRC_DIR, "styles", "global.css"),
  path.join(SRC_DIR, "components", "sections", "ThreePawnCanvas.tsx"),
  path.join(SRC_DIR, "components", "experience", "Scroll3DKingCanvas.tsx"),
];

for (const file of srcCodeFiles) {
  if (PERMITTED_GRADIENT_FILES.includes(file)) {
    continue; // Permitted canvas textures or global.css checkerboard/chess-grid
  }
  const relPath = path.relative(ROOT_DIR, file);
  const content = fs.readFileSync(file, "utf-8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (GRADIENT_REGEX.test(line)) {
      violations.push({
        file: relPath,
        line: idx + 1,
        rule: `CSS gradient prohibited by woodcut aesthetic. Content: "${line.trim()}"`,
      });
    }
  });
}

// 4. Guard: No arbitrary hex colors in Tailwind markup (e.g. bg-[#...], text-[#...])
const ARBITRARY_HEX_REGEX = /\b(?:bg|text|border|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/;
const markupFiles = getFiles(SRC_DIR, [".astro", ".tsx"]);
for (const file of markupFiles) {
  const relPath = path.relative(ROOT_DIR, file);
  const content = fs.readFileSync(file, "utf-8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (ARBITRARY_HEX_REGEX.test(line)) {
      violations.push({
        file: relPath,
        line: idx + 1,
        rule: `Arbitrary hex color class found. Use semantic tokens from src/styles/tokens.css. Content: "${line.trim()}"`,
      });
    }
  });
}

// Summary and exit
if (violations.length === 0) {
  console.log("\x1b[32m[SUCCESS]\x1b[0m All architectural design boundaries verified!");
  process.exit(0);
} else {
  console.error(`\x1b[31m[FAILURE]\x1b[0m Found ${violations.length} boundary violation(s):`);
  for (const v of violations) {
    console.error(`  - \x1b[33m${v.file}:${v.line}\x1b[0m: ${v.rule}`);
  }
  process.exit(1);
}
