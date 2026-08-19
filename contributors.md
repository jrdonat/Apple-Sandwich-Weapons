# Contributing

This guide covers adding and validating weapon data, using the bulk importer, and configuring future games. Generated payloads are build artifacts; contribute source JSON and tooling changes instead of committing `dist/`.

## Prerequisites and checks

Install Node.js 20 or a newer active LTS release. The project has no runtime dependencies, but its lockfile is committed for reproducible installation.

```sh
npm ci
npm test
npm run validate
npm run build
```

`npm test` runs the built-in Node test runner. `npm run validate` performs a complete build in a temporary directory and removes it. `npm run build` writes all configured payloads to the ignored `dist/` directory.

Source metadata normally comes from local Git. Supply it explicitly for a production-style build:

```sh
npm run build -- --branch main --commit <full-commit-sha>
```

The equivalent environment variables are `SOURCE_BRANCH` and `SOURCE_COMMIT`; GitHub Actions also supplies `GITHUB_REF_NAME` and `GITHUB_SHA`.

## Weapon files

Every real weapon is an individual `.json` file in a category directory. It must contain a top-level object with:

- `Id`: a stable, non-empty lowercase kebab-case identifier, such as `sentinel-ar` or `heavy-sniper`.
- `DisplayName`: a non-empty player-facing name.

The filename must be exactly `<Id>.json`, including case. IDs must be unique across the entire configured game, even when files are in different categories. Folder placement supplies slot and category information, so do not add `slot` or `category` properties.

Other properties are deliberately extensible. Unknown statistics are retained instead of being checked against a rigid schema. Nested objects, arrays, booleans, strings, finite numbers, and JSON `null` are supported.

### Converting live Luau settings

Use these portable JSON representations when translating a live settings module:

- Omit `Module`; the JSON file is already the weapon's data source.
- Convert Luau `nil` to JSON `null`. A consumer may replace `null` with its own default.
- Convert `Vector2.new(x, y)` to `{ "x": x, "y": y }`.
- Convert Roblox instance references to stable strings, for example `ReplicatedStorage.Guis.Scopes.Basic`.
- Keep stat names and nesting consistent with the live settings wherever the values are JSON-compatible.

Example:

```json
{
  "Id": "sentinel-ar",
  "DisplayName": "Sentinel AR",
  "FireRate": 0.09,
  "FireModes": ["Auto", "Semi"],
  "MagazineCapacity": 30,
  "Damage": {
    "Humanoid": 14,
    "Car": 10
  },
  "Recoil": {
    "RecoverySpeed": null,
    "Pitch": { "x": 1.3, "y": 1.45 },
    "Yaw": { "x": 0.1, "y": 0.4 }
  },
  "ScopeGui": "ReplicatedStorage.Guis.Scopes.Basic"
}
```

Files named exactly `Placeholder.json` are scaffolding. The builder ignores them, does not validate them as weapons, and does not include them in output. Other JSON files below a configured source are treated as weapons. JSON elsewhere, including `imports/`, is never scanned.

## Bulk imports

`imports/example-weapons.json` demonstrates the manifest format without becoming part of a game tree.

Preview an import without writing:

```sh
npm run import-weapons -- imports/example-weapons.json --dry-run
```

Create new weapons:

```sh
npm run import-weapons -- imports/example-weapons.json
```

Update weapons in their existing categories:

```sh
npm run import-weapons -- imports/example-weapons.json --update
```

The importer validates the complete manifest and a prepared copy of the resulting game tree before its first source write. It rejects unknown games, duplicate IDs, absolute or traversing paths, filename-like category paths, updates without `--update`, and attempts to relocate an existing ID. Relocation requires a deliberate manual file move.

Once validation succeeds, ordinary filesystem failures could still interrupt sequential writes; rerun the same manifest with `--update` after resolving the filesystem problem. The importer never commits, pushes, or changes branches.

## Adding another game

1. Add a new source directory inside the repository, normally as a top-level folder.
2. Add one entry to `games.json` with a unique lowercase kebab-case slug, repository-relative `source`, and unique `.json` filename in `output`.
3. Add category directories and weapon files.
4. Run `npm test`, `npm run validate`, and `npm run build`.

Example:

```json
{
  "games": {
    "hf-weapons": {
      "source": "HF - Weapons",
      "output": "hf-weapons.json"
    },
    "future-game": {
      "source": "Future Game",
      "output": "future-game.json"
    }
  }
}
```

Only configured sources are scanned. `tools`, `tests`, `dist`, `.github`, `imports`, and unrelated top-level directories are not inferred as games.

## Troubleshooting validation failures

- **Malformed weapon JSON**: validate the file with a JSON parser; comments and trailing commas are not valid JSON.
- **Missing Id or DisplayName**: add both required non-empty string properties.
- **Invalid Id**: use lowercase letters and digits separated only by single hyphens, then rename the file to match.
- **Filename/Id mismatch**: make the filename exactly `<Id>.json`.
- **Duplicate weapon Id**: search the whole configured game, not just the current category.
- **Unsafe path**: remove absolute paths, `.` or `..` segments, repeated separators, and filenames from import `Path` values.
- **Update rejected**: pass `--update` only when replacing the same ID at the same path; move files manually when changing categories.
- **Configured source missing**: create the directory named by `source` or correct `games.json`.
- **Duplicate output**: every game must publish a distinct case-insensitive output filename.
- **Pages returns 404**: confirm the deployment workflow succeeded and that Settings → Pages uses GitHub Actions as its source.

## Pull requests

Keep each change focused. Before opening or updating a pull request, run `npm test` and `npm run validate`, explain any intentionally unusual stat representation, and confirm generated `dist/` files are not staged.
