import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildAll } from "./build.mjs";

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "weapon-validation-"));

try {
  const outputs = await buildAll({
    repoRoot: process.cwd(),
    outputDir: temporaryDirectory,
    branch: "validation",
    commit: "validation",
  });
  console.log(`Validated ${outputs.length} configured game${outputs.length === 1 ? "" : "s"}`);
} catch (error) {
  console.error(`Validation failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
