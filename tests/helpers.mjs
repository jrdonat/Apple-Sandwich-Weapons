import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function temporaryRepository(test, games = { "test-game": "Game" }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "weapon-tests-"));
  test.after(() => rm(root, { recursive: true, force: true }));

  const config = { games: {} };
  for (const [slug, source] of Object.entries(games)) {
    await mkdir(path.join(root, source), { recursive: true });
    config.games[slug] = { source, output: `${slug}.json` };
  }
  await writeJson(path.join(root, "games.json"), config);
  return root;
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function weapon(Id, extra = {}) {
  return { Id, DisplayName: Id.toUpperCase(), ...extra };
}
