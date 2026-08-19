import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { buildAll } from "../tools/build.mjs";
import { loadGamesConfig } from "../tools/lib/config.mjs";
import { validateWeapon } from "../tools/lib/validation.mjs";
import { buildWeaponTree } from "../tools/lib/weapon-tree.mjs";
import { temporaryRepository, weapon, writeJson } from "./helpers.mjs";

test("loads a valid games.json", async (t) => {
  const root = await temporaryRepository(t);
  const config = await loadGamesConfig({ repoRoot: root });
  assert.deepEqual([...config.games.keys()], ["test-game"]);
  assert.equal(config.games.get("test-game").source, "Game");
});

test("rejects unsafe and duplicate configuration outputs", async (t) => {
  const root = await temporaryRepository(t, { one: "One", two: "Two" });
  const configPath = path.join(root, "games.json");

  await writeJson(configPath, {
    games: { one: { source: "../escape", output: "one.json" } },
  });
  await assert.rejects(() => loadGamesConfig({ repoRoot: root }), /unsafe path segment/u);

  await writeJson(configPath, {
    games: { one: { source: "One", output: path.resolve(root, "one.json") } },
  });
  await assert.rejects(() => loadGamesConfig({ repoRoot: root }), /absolute path/u);

  await writeJson(configPath, {
    games: { one: { source: "One", output: "../escape.json" } },
  });
  await assert.rejects(() => loadGamesConfig({ repoRoot: root }), /unsafe path segment/u);

  await writeJson(configPath, {
    games: {
      one: { source: "One", output: "same.json" },
      two: { source: "Two", output: "SAME.json" },
    },
  });
  await assert.rejects(() => loadGamesConfig({ repoRoot: root }), /Duplicate output/u);
});

test("fails clearly for a missing configured source", async (t) => {
  const root = await temporaryRepository(t);
  await writeJson(path.join(root, "games.json"), {
    games: { missing: { source: "Missing", output: "missing.json" } },
  });
  await assert.rejects(() => loadGamesConfig({ repoRoot: root }), /does not exist/u);
});

test("recursively builds nested trees, preserves empty directories and nulls, and ignores placeholders", async (t) => {
  const root = await temporaryRepository(t);
  const source = path.join(root, "Game");
  await mkdir(path.join(source, "Primary", "Empty"), { recursive: true });
  await writeJson(path.join(source, "Primary", "Empty", "Placeholder.json"), {});
  await writeJson(
    path.join(source, "Primary", "Rifles", "m4a1.json"),
    weapon("m4a1", { AimDownSpread: null, Recoil: { RecoverySpeed: null } }),
  );

  const { tree, ids } = await buildWeaponTree(source);
  assert.deepEqual(tree.Primary.Empty, {});
  assert.equal(tree.Primary.Rifles.m4a1.AimDownSpread, null);
  assert.equal(tree.Primary.Rifles.m4a1.Recoil.RecoverySpeed, null);
  assert.equal(Object.hasOwn(tree.Primary.Empty, "Placeholder"), false);
  assert.equal(ids.get("m4a1"), path.join("Primary", "Rifles", "m4a1.json"));
});

test("emits deterministic ordering and byte-identical output", async (t) => {
  const root = await temporaryRepository(t);
  await writeJson(path.join(root, "Game", "Zed", "zulu.json"), weapon("zulu"));
  await writeJson(path.join(root, "Game", "Alpha", "bravo.json"), weapon("bravo"));
  await writeJson(path.join(root, "Game", "Alpha", "alpha.json"), weapon("alpha"));

  const outputDir = path.join(root, "dist");
  await buildAll({ repoRoot: root, outputDir, branch: "main", commit: "abc123" });
  const first = await readFile(path.join(outputDir, "test-game.json"));
  await buildAll({ repoRoot: root, outputDir, branch: "main", commit: "abc123" });
  const second = await readFile(path.join(outputDir, "test-game.json"));
  assert.deepEqual(first, second);

  const text = second.toString("utf8");
  assert.ok(text.indexOf('"Alpha"') < text.indexOf('"Zed"'));
  assert.ok(text.indexOf('"alpha"') < text.indexOf('"bravo"'));
  assert.ok(text.endsWith("\n"));
});

test("rejects malformed JSON and invalid required metadata", async (t) => {
  const cases = [
    {
      name: "malformed",
      filename: "broken.json",
      contents: "{ nope",
      pattern: /Malformed weapon JSON/u,
    },
    {
      name: "missing Id",
      filename: "broken.json",
      contents: JSON.stringify({ DisplayName: "Broken" }),
      pattern: /non-empty string Id/u,
    },
    {
      name: "missing DisplayName",
      filename: "broken.json",
      contents: JSON.stringify({ Id: "broken" }),
      pattern: /non-empty string DisplayName/u,
    },
    {
      name: "non-object",
      filename: "broken.json",
      contents: "[]",
      pattern: /top-level JSON object/u,
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async (t2) => {
      const root = await temporaryRepository(t2);
      await writeFile(path.join(root, "Game", item.filename), item.contents, "utf8");
      await assert.rejects(() => buildWeaponTree(path.join(root, "Game")), item.pattern);
    });
  }
});

test("rejects filename mismatches, duplicate IDs, and structural conflicts", async (t) => {
  await t.test("filename mismatch", async (t2) => {
    const root = await temporaryRepository(t2);
    await writeJson(path.join(root, "Game", "wrong.json"), weapon("right"));
    await assert.rejects(() => buildWeaponTree(path.join(root, "Game")), /Filename\/Id mismatch/u);
  });

  await t.test("duplicate IDs", async (t2) => {
    const root = await temporaryRepository(t2);
    await writeJson(path.join(root, "Game", "One", "same.json"), weapon("same"));
    await writeJson(path.join(root, "Game", "Two", "same.json"), weapon("same"));
    await assert.rejects(() => buildWeaponTree(path.join(root, "Game")), /Duplicate weapon Id same/u);
  });

  await t.test("structural conflict", async (t2) => {
    const root = await temporaryRepository(t2);
    await mkdir(path.join(root, "Game", "rifle"), { recursive: true });
    await writeJson(path.join(root, "Game", "rifle.json"), weapon("rifle"));
    await assert.rejects(() => buildWeaponTree(path.join(root, "Game")), /conflicts structurally/u);
  });
});

test("keeps independently configured games isolated", async (t) => {
  const root = await temporaryRepository(t, { "game-one": "One", "game-two": "Two" });
  await writeJson(path.join(root, "One", "Primary", "one.json"), weapon("one"));
  await writeJson(path.join(root, "Two", "Secondary", "two.json"), weapon("two"));
  const outputDir = path.join(root, "dist");

  await buildAll({ repoRoot: root, outputDir, branch: "main", commit: "abc" });
  const one = JSON.parse(await readFile(path.join(outputDir, "game-one.json"), "utf8"));
  const two = JSON.parse(await readFile(path.join(outputDir, "game-two.json"), "utf8"));
  assert.equal(one.Weapons.Primary.one.Id, "one");
  assert.equal(Object.hasOwn(one.Weapons, "Secondary"), false);
  assert.equal(two.Weapons.Secondary.two.Id, "two");
  assert.equal(Object.hasOwn(two.Weapons, "Primary"), false);
});

test("rejects non-finite numeric values supplied programmatically", () => {
  assert.throws(
    () => validateWeapon(weapon("bad-number", { FireRate: Number.POSITIVE_INFINITY })),
    /non-finite number/u,
  );
});
