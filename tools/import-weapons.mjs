import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGamesConfig } from "./lib/config.mjs";
import {
  assertSafeRelativePath,
  formatJson,
  isPlainObject,
  resolveInside,
  validateWeapon,
} from "./lib/validation.mjs";
import { buildWeaponTree } from "./lib/weapon-tree.mjs";

function parseManifest(text, manifestPath) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Malformed import manifest at ${manifestPath}: ${error.message}`);
  }
}

function parseArguments(arguments_) {
  const flags = new Set();
  let manifestPath;

  for (const argument of arguments_) {
    if (argument === "--dry-run" || argument === "--update") {
      if (flags.has(argument)) throw new Error(`Duplicate option: ${argument}`);
      flags.add(argument);
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown import option: ${argument}`);
    } else if (manifestPath) {
      throw new Error("Provide exactly one import manifest path");
    } else {
      manifestPath = argument;
    }
  }

  if (!manifestPath) throw new Error("Provide an import manifest path");
  return {
    manifestPath,
    dryRun: flags.has("--dry-run"),
    update: flags.has("--update"),
  };
}

async function validatePreparedTree(sourcePath, operations) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "weapon-import-"));
  const preparedSource = path.join(temporaryRoot, "game");

  try {
    await cp(sourcePath, preparedSource, { recursive: true });
    for (const operation of operations) {
      const temporaryDestination = path.join(preparedSource, ...operation.categorySegments, `${operation.id}.json`);
      await mkdir(path.dirname(temporaryDestination), { recursive: true });
      await writeFile(temporaryDestination, formatJson(operation.data), "utf8");
    }
    await buildWeaponTree(preparedSource);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function importWeapons({
  repoRoot = process.cwd(),
  manifestPath,
  dryRun = false,
  update = false,
  logger = console.log,
} = {}) {
  if (!manifestPath) throw new Error("Provide an import manifest path");
  const resolvedManifest = path.resolve(repoRoot, manifestPath);
  const manifest = parseManifest(await readFile(resolvedManifest, "utf8"), resolvedManifest);

  if (!isPlainObject(manifest)) {
    throw new Error("Import manifest must contain a top-level JSON object");
  }

  const config = await loadGamesConfig({ repoRoot });
  if (typeof manifest.Game !== "string" || !config.games.has(manifest.Game)) {
    throw new Error(`Unknown game slug: ${String(manifest.Game)}`);
  }
  if (!Array.isArray(manifest.Weapons) || manifest.Weapons.length === 0) {
    throw new Error("Import manifest Weapons must be a non-empty array");
  }

  const game = config.games.get(manifest.Game);
  const { ids: existingIds } = await buildWeaponTree(game.sourcePath);
  const manifestIds = new Set();
  const operations = [];

  for (let index = 0; index < manifest.Weapons.length; index += 1) {
    const entry = manifest.Weapons[index];
    const label = `Weapons[${index}]`;
    if (!isPlainObject(entry)) throw new Error(`${label} must be an object`);

    const categorySegments = assertSafeRelativePath(entry.Path, `${label}.Path`);
    validateWeapon(entry.Data, `${label}.Data`);

    if (manifestIds.has(entry.Data.Id)) {
      throw new Error(`Duplicate import Id ${entry.Data.Id}`);
    }
    manifestIds.add(entry.Data.Id);

    const categoryPath = resolveInside(game.sourcePath, categorySegments, `${label}.Path`);
    const destination = resolveInside(
      game.sourcePath,
      [...categorySegments, `${entry.Data.Id}.json`],
      `${label} destination`,
    );
    const existingRelative = existingIds.get(entry.Data.Id);
    let action = "create";

    if (existingRelative) {
      if (!update) {
        throw new Error(
          `Weapon Id ${entry.Data.Id} already exists at ${existingRelative}; use --update to replace it`,
        );
      }

      const expectedRelative = path.relative(game.sourcePath, destination);
      if (path.normalize(existingRelative) !== path.normalize(expectedRelative)) {
        throw new Error(
          `Weapon Id ${entry.Data.Id} already exists at ${existingRelative}; imports cannot relocate weapons to ${expectedRelative}`,
        );
      }
      action = "update";
    }

    operations.push({
      action,
      id: entry.Data.Id,
      data: entry.Data,
      categorySegments,
      categoryPath,
      destination,
    });
  }

  await validatePreparedTree(game.sourcePath, operations);

  if (!dryRun) {
    for (const operation of operations) {
      await mkdir(operation.categoryPath, { recursive: true });
      await writeFile(operation.destination, formatJson(operation.data), "utf8");
    }
    await buildWeaponTree(game.sourcePath);
  }

  for (const operation of operations) {
    const relative = path.relative(repoRoot, operation.destination);
    logger(`${dryRun ? "Would " : ""}${operation.action} ${relative}`);
  }

  const created = operations.filter((operation) => operation.action === "create").length;
  const updated = operations.length - created;
  logger(
    `${dryRun ? "Dry run: " : ""}${created} created, ${updated} updated for ${game.slug}`,
  );
  return { created, updated, operations };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await importWeapons({ repoRoot: process.cwd(), ...options });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    console.error(`Import failed: ${error.message}`);
    process.exitCode = 1;
  });
}
