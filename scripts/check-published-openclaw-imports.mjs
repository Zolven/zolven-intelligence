#!/usr/bin/env node
// Verifies an installed release tarball: every named import that dist makes
// from an external @openclaw/* package must exist in the version npm installed.
// Fork releases resolve those packages (e.g. @openclaw/ai) from the registry,
// not from this workspace, so a fork-only export compiles and packs fine but
// fails to link at runtime (v2026.7.1-zolven.7). `--version` never loads those
// chunks, so the install smoke alone cannot catch it.
//
// Usage: node scripts/check-published-openclaw-imports.mjs <installed-package-root>
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*"(@openclaw\/[^"]+)"/g;

export function collectNamedOpenClawImports(distDir) {
  const wanted = new Map();
  for (const entry of fs.readdirSync(distDir, { recursive: true })) {
    const file = String(entry);
    if (!file.endsWith(".js")) {
      continue;
    }
    const source = fs.readFileSync(path.join(distDir, file), "utf8");
    for (const match of source.matchAll(NAMED_IMPORT)) {
      const names = match[1]
        .split(",")
        .map((part) => part.trim().split(/\s+as\s+/)[0])
        .filter((name) => name && !name.startsWith("type "));
      const specifier = match[2];
      const known = wanted.get(specifier) ?? new Set();
      for (const name of names) {
        known.add(name);
      }
      wanted.set(specifier, known);
    }
  }
  return wanted;
}

export async function findMissingPublishedImports(packageRoot) {
  const requireFromPackage = createRequire(path.join(packageRoot, "package.json"));
  const missing = [];
  let checked = 0;
  for (const [specifier, names] of collectNamedOpenClawImports(path.join(packageRoot, "dist"))) {
    let resolved;
    try {
      resolved = requireFromPackage.resolve(specifier);
    } catch {
      // Bundled workspace packages never reach dist as bare specifiers; an
      // unresolvable one is itself a broken release.
      missing.push(`${specifier} (not installed)`);
      continue;
    }
    const exports = await import(pathToFileURL(resolved).href);
    for (const name of names) {
      checked += 1;
      if (!(name in exports)) {
        missing.push(`${specifier} :: ${name}`);
      }
    }
  }
  return { checked, missing };
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? "")).href) {
  const packageRoot = process.argv[2];
  if (!packageRoot) {
    console.error(
      "Usage: node scripts/check-published-openclaw-imports.mjs <installed-package-root>",
    );
    process.exit(2);
  }
  const { checked, missing } = await findMissingPublishedImports(path.resolve(packageRoot));
  if (missing.length > 0) {
    console.error(
      `Release imports missing from installed @openclaw packages:\n  ${missing.join("\n  ")}`,
    );
    process.exit(1);
  }
  console.log(`Published @openclaw imports OK: ${checked} named imports resolve.`);
}
