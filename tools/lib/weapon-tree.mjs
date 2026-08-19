import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { compareNames, validateWeapon } from "./validation.mjs";

async function parseWeaponFile(filePath, relativePath) {
  let data;
  try {
    data = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Malformed weapon JSON at ${relativePath}: ${error.message}`);
  }

  validateWeapon(data, relativePath);
  const expectedName = `${data.Id}.json`;
  const actualName = path.basename(filePath);
  if (actualName !== expectedName) {
    throw new Error(
      `Filename/Id mismatch at ${relativePath}: expected ${expectedName} for Id ${data.Id}`,
    );
  }

  return data;
}

export async function buildWeaponTree(sourceRoot) {
  const ids = new Map();

  async function visit(directory, relativeDirectory = "") {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
      compareNames(left.name, right.name),
    );
    const result = {};

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Unsafe symbolic link in configured game: ${path.join(relativeDirectory, entry.name)}`,
        );
      }
      if (!entry.isDirectory()) continue;
      const relative = path.join(relativeDirectory, entry.name);
      result[entry.name] = await visit(path.join(directory, entry.name), relative);
    }

    for (const entry of entries) {
      if (!entry.isFile() || path.extname(entry.name) !== ".json") continue;
      if (entry.name === "Placeholder.json") continue;

      const relative = path.join(relativeDirectory, entry.name);
      const data = await parseWeaponFile(path.join(directory, entry.name), relative);
      if (ids.has(data.Id)) {
        throw new Error(`Duplicate weapon Id ${data.Id}: ${ids.get(data.Id)} and ${relative}`);
      }
      if (Object.hasOwn(result, data.Id)) {
        throw new Error(
          `Weapon ${relative} conflicts structurally with directory ${path.join(relativeDirectory, data.Id)}`,
        );
      }

      ids.set(data.Id, relative);
      result[data.Id] = data;
    }

    return result;
  }

  const tree = await visit(sourceRoot);
  return { tree, ids };
}
