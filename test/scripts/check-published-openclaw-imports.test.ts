import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findMissingPublishedImports } from "../../scripts/check-published-openclaw-imports.mjs";

const roots: string[] = [];

function writeInstalledPackage(distSource: string, publishedSource: string): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "published-imports-")));
  roots.push(root);
  fs.mkdirSync(path.join(root, "dist", "nested"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"openclaw","type":"module"}\n');
  fs.writeFileSync(path.join(root, "dist", "nested", "chunk.js"), distSource);
  const published = path.join(root, "node_modules", "@openclaw", "ai");
  fs.mkdirSync(path.join(published, "internal"), { recursive: true });
  fs.writeFileSync(
    path.join(published, "package.json"),
    JSON.stringify({
      name: "@openclaw/ai",
      type: "module",
      exports: { "./internal/anthropic": "./internal/anthropic.js" },
    }),
  );
  fs.writeFileSync(path.join(published, "internal", "anthropic.js"), publishedSource);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("check-published-openclaw-imports", () => {
  it("flags a dist import the registry-installed package does not export", async () => {
    const root = writeInstalledPackage(
      'import { present, forkOnly as alias } from "@openclaw/ai/internal/anthropic";\n',
      "export const present = 1;\n",
    );

    await expect(findMissingPublishedImports(root)).resolves.toEqual({
      checked: 2,
      missing: ["@openclaw/ai/internal/anthropic :: forkOnly"],
    });
  });

  it("passes when every named import resolves", async () => {
    const root = writeInstalledPackage(
      'import { present } from "@openclaw/ai/internal/anthropic";\n',
      "export const present = 1;\n",
    );

    await expect(findMissingPublishedImports(root)).resolves.toEqual({ checked: 1, missing: [] });
  });
});
