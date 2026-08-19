import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { importWeapons } from "../tools/import-weapons.mjs";
import { temporaryRepository, weapon, writeJson } from "./helpers.mjs";

async function manifest(root, value, name = "import.json") {
  const manifestPath = path.join(root, name);
  await writeJson(manifestPath, value);
  return manifestPath;
}

async function doesNotExist(filePath) {
  try {
    await access(filePath);
    return false;
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  }
}

test("bulk creates several consistently formatted weapons", async (t) => {
  const root = await temporaryRepository(t);
  const manifestPath = await manifest(root, {
    Game: "test-game",
    Weapons: [
      { Path: "Primary/Rifles", Data: weapon("alpha", { Optional: null }) },
      { Path: "Secondary", Data: weapon("bravo") },
    ],
  });

  const result = await importWeapons({ repoRoot: root, manifestPath, logger: () => {} });
  assert.deepEqual({ created: result.created, updated: result.updated }, { created: 2, updated: 0 });
  const alpha = await readFile(path.join(root, "Game", "Primary", "Rifles", "alpha.json"), "utf8");
  assert.equal(JSON.parse(alpha).Optional, null);
  assert.ok(alpha.endsWith("\n"));
  assert.equal(JSON.parse(await readFile(path.join(root, "Game", "Secondary", "bravo.json"))).Id, "bravo");
});

test("dry-run performs validation and leaves the game tree unchanged", async (t) => {
  const root = await temporaryRepository(t);
  const destination = path.join(root, "Game", "Primary", "alpha.json");
  const manifestPath = await manifest(root, {
    Game: "test-game",
    Weapons: [{ Path: "Primary", Data: weapon("alpha") }],
  });

  const lines = [];
  await importWeapons({
    repoRoot: root,
    manifestPath,
    dryRun: true,
    logger: (line) => lines.push(line),
  });
  assert.equal(await doesNotExist(destination), true);
  assert.match(lines.join("\n"), /Would create/u);
});

test("updates in place only with --update", async (t) => {
  const root = await temporaryRepository(t);
  const destination = path.join(root, "Game", "Primary", "alpha.json");
  await writeJson(destination, weapon("alpha", { Damage: 1 }));
  const manifestPath = await manifest(root, {
    Game: "test-game",
    Weapons: [{ Path: "Primary", Data: weapon("alpha", { Damage: 2 }) }],
  });

  await assert.rejects(
    () => importWeapons({ repoRoot: root, manifestPath, logger: () => {} }),
    /use --update/u,
  );
  assert.equal(JSON.parse(await readFile(destination)).Damage, 1);

  const result = await importWeapons({
    repoRoot: root,
    manifestPath,
    update: true,
    logger: () => {},
  });
  assert.equal(result.updated, 1);
  assert.equal(JSON.parse(await readFile(destination)).Damage, 2);
});

test("rejects attempted relocation even with --update", async (t) => {
  const root = await temporaryRepository(t);
  await writeJson(path.join(root, "Game", "Primary", "alpha.json"), weapon("alpha"));
  const manifestPath = await manifest(root, {
    Game: "test-game",
    Weapons: [{ Path: "Secondary", Data: weapon("alpha") }],
  });
  await assert.rejects(
    () => importWeapons({ repoRoot: root, manifestPath, update: true, logger: () => {} }),
    /cannot relocate/u,
  );
});

test("rejects duplicate import IDs and unknown game slugs", async (t) => {
  const root = await temporaryRepository(t);
  const duplicatePath = await manifest(root, {
    Game: "test-game",
    Weapons: [
      { Path: "One", Data: weapon("same") },
      { Path: "Two", Data: weapon("same") },
    ],
  });
  await assert.rejects(
    () => importWeapons({ repoRoot: root, manifestPath: duplicatePath, logger: () => {} }),
    /Duplicate import Id/u,
  );

  const unknownPath = await manifest(
    root,
    { Game: "unknown", Weapons: [{ Path: "One", Data: weapon("one") }] },
    "unknown.json",
  );
  await assert.rejects(
    () => importWeapons({ repoRoot: root, manifestPath: unknownPath, logger: () => {} }),
    /Unknown game slug/u,
  );
});

test("rejects absolute, traversal, filename, and escaping destination paths", async (t) => {
  const cases = [
    ["absolute", "C:\\outside", /absolute path/u],
    ["traversal", "Primary/../outside", /unsafe path segment/u],
    ["filename", "Primary/alpha.json", /category directory/u],
    ["posix absolute", "/outside", /absolute path/u],
  ];

  for (const [name, unsafePath, pattern] of cases) {
    await t.test(name, async (t2) => {
      const root = await temporaryRepository(t2);
      const manifestPath = await manifest(root, {
        Game: "test-game",
        Weapons: [{ Path: unsafePath, Data: weapon("alpha") }],
      });
      await assert.rejects(
        () => importWeapons({ repoRoot: root, manifestPath, logger: () => {} }),
        pattern,
      );
    });
  }
});

test("validates the complete manifest before writing any source files", async (t) => {
  const root = await temporaryRepository(t);
  const firstDestination = path.join(root, "Game", "Primary", "valid.json");
  const manifestPath = await manifest(root, {
    Game: "test-game",
    Weapons: [
      { Path: "Primary", Data: weapon("valid") },
      { Path: "Secondary", Data: { Id: "invalid" } },
    ],
  });

  await assert.rejects(
    () => importWeapons({ repoRoot: root, manifestPath, logger: () => {} }),
    /DisplayName/u,
  );
  assert.equal(await doesNotExist(firstDestination), true);
});
