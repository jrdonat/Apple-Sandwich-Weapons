import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import {
  assertSafeRelativePath,
  isPlainObject,
  resolveInside,
} from "./validation.mjs";

function parseConfig(text, configPath) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Malformed game configuration at ${configPath}: ${error.message}`);
  }
}

export async function loadGamesConfig({
  repoRoot = process.cwd(),
  configPath = path.join(repoRoot, "games.json"),
} = {}) {
  const resolvedRoot = path.resolve(repoRoot);
  const realRoot = await realpath(resolvedRoot);
  const parsed = parseConfig(await readFile(configPath, "utf8"), configPath);

  if (!isPlainObject(parsed) || !isPlainObject(parsed.games)) {
    throw new Error("games.json must contain a games object");
  }

  const games = new Map();
  const outputs = new Map();

  for (const [slug, entry] of Object.entries(parsed.games)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
      throw new Error(`Invalid game slug ${JSON.stringify(slug)}; use lowercase kebab-case`);
    }

    if (!isPlainObject(entry)) {
      throw new Error(`Configuration for ${slug} must be an object`);
    }

    const sourceSegments = assertSafeRelativePath(entry.source, `${slug}.source`, {
      fileName: true,
    });
    const outputSegments = assertSafeRelativePath(entry.output, `${slug}.output`, {
      fileName: true,
    });

    if (outputSegments.length !== 1 || !entry.output.endsWith(".json")) {
      throw new Error(`${slug}.output must be a JSON filename directly under dist/`);
    }

    const sourcePath = resolveInside(resolvedRoot, sourceSegments, `${slug}.source`);
    const outputKey = entry.output.toLowerCase();
    if (outputs.has(outputKey)) {
      throw new Error(
        `Duplicate output ${entry.output} configured for ${outputs.get(outputKey)} and ${slug}`,
      );
    }

    let sourceStat;
    try {
      sourceStat = await lstat(sourcePath);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(`Configured source directory does not exist for ${slug}: ${entry.source}`);
      }
      throw error;
    }

    if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
      throw new Error(`Configured source for ${slug} is not a directory: ${entry.source}`);
    }

    const realSource = await realpath(sourcePath);
    const realRelative = path.relative(realRoot, realSource);
    if (
      realRelative === ".." ||
      realRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelative)
    ) {
      throw new Error(`${slug}.source resolves outside the repository: ${entry.source}`);
    }

    outputs.set(outputKey, slug);
    games.set(slug, {
      slug,
      source: entry.source,
      output: entry.output,
      sourcePath,
    });
  }

  if (games.size === 0) {
    throw new Error("games.json must configure at least one game");
  }

  return { repoRoot: resolvedRoot, games };
}
