import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadGamesConfig } from "./lib/config.mjs";
import { formatJson } from "./lib/validation.mjs";
import { buildWeaponTree } from "./lib/weapon-tree.mjs";

function parseArguments(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!["--branch", "--commit", "--output-dir"].includes(argument)) {
      throw new Error(`Unknown build argument: ${argument}`);
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value`);
    }
    options[argument.slice(2).replace("output-dir", "outputDir")] = value;
    index += 1;
  }
  return options;
}

function readGit(repoRoot, arguments_, fallback) {
  try {
    return execFileSync("git", arguments_, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

export function resolveSourceMetadata(repoRoot, options = {}) {
  return {
    Branch:
      options.branch ??
      process.env.SOURCE_BRANCH ??
      process.env.GITHUB_REF_NAME ??
      readGit(repoRoot, ["branch", "--show-current"], "local"),
    Commit:
      options.commit ??
      process.env.SOURCE_COMMIT ??
      process.env.GITHUB_SHA ??
      readGit(repoRoot, ["rev-parse", "HEAD"], "unknown"),
  };
}

export async function buildAll({
  repoRoot = process.cwd(),
  outputDir = path.join(repoRoot, "dist"),
  branch,
  commit,
  clean = true,
} = {}) {
  const config = await loadGamesConfig({ repoRoot });
  const resolvedOutput = path.resolve(outputDir);
  const defaultOutput = path.join(config.repoRoot, "dist");
  if (clean && resolvedOutput === defaultOutput) {
    await rm(resolvedOutput, { recursive: true, force: true });
  }
  await mkdir(resolvedOutput, { recursive: true });

  const source = resolveSourceMetadata(config.repoRoot, { branch, commit });
  const outputs = [];

  for (const game of config.games.values()) {
    const { tree } = await buildWeaponTree(game.sourcePath);
    const payload = {
      FormatVersion: 1,
      Game: game.slug,
      Source: source,
      Weapons: tree,
    };
    const outputPath = path.join(resolvedOutput, game.output);
    await writeFile(outputPath, formatJson(payload), "utf8");
    outputs.push(outputPath);
  }

  return outputs;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const outputs = await buildAll({
    repoRoot: process.cwd(),
    ...options,
  });
  for (const output of outputs) {
    console.log(`Built ${path.relative(process.cwd(), output)}`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  });
}
