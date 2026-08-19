# Apple Sandwich Weapons

This repository is the source of truth for game weapon statistics. Each configured game or weapon collection owns an independent directory tree of small, reviewable weapon JSON files. Node.js tooling validates those files and consolidates each game into a deterministic payload that GitHub Pages can serve.

Roblox and Luau integration are intentionally outside this repository's current scope.

## Current game hierarchy

`games.json` currently maps the stable slug `hf-weapons` to `HF - Weapons/`. The hierarchy is:

```text
HF - Weapons/
├── Primary/
│   ├── AssaultRifle/
│   ├── Carbine/
│   ├── DMR/
│   ├── LMG/
│   ├── PDW/
│   ├── Shotgun/
│   └── Sniper/
└── Secondary/
```

Folder names are preserved exactly in generated payloads. A weapon's folder supplies its slot and category, so weapon files must not duplicate that information with `slot` or `category` fields.

## Weapon files

Every real weapon is an individual `.json` file in a category directory. It must contain a top-level object with:

- `Id`: a stable, non-empty lowercase kebab-case identifier, such as `m4a1` or `heavy-sniper`.
- `DisplayName`: a non-empty player-facing name.

The filename must be exactly `<Id>.json`, including case. IDs must be unique across the entire configured game, even when files are in different categories.

Other properties are deliberately extensible. Unknown statistics are retained instead of being checked against a rigid schema. Nested objects, arrays, booleans, strings, and finite numbers are supported. JSON `null` is preserved exactly and tells a consuming game that it may apply its own default.

Example:

```json
{
  "Id": "m4a1",
  "DisplayName": "M4A1",
  "FireRate": 0.1,
  "FireModes": ["Auto", "Semi"],
  "MagazineCapacity": 30,
  "Damage": {
    "Humanoid": 15,
    "Car": 10
  },
  "AimDownSpread": null
}
```

Files named exactly `Placeholder.json` are scaffolding. The builder ignores them, does not validate them as weapons, and does not include them in output. Other JSON files below a configured source are treated as weapons. JSON elsewhere, including `imports/`, is never scanned.

## Local operation

Install Node.js 20 or a newer active LTS release. The repository has no runtime dependencies, but the lockfile is committed so installation is reproducible.

```sh
npm ci
npm test
npm run validate
npm run build
```

`npm test` runs the built-in Node test runner. `npm run validate` performs a complete build in a temporary directory and removes it, so it does not leave production-looking files behind. `npm run build` writes all configured payloads to the ignored `dist/` directory.

Source metadata normally comes from local Git. It can be made explicit for a reproducible production-style build:

```sh
npm run build -- --branch main --commit <full-commit-sha>
```

The equivalent environment variables are `SOURCE_BRANCH` and `SOURCE_COMMIT`; GitHub Actions also supplies `GITHUB_REF_NAME` and `GITHUB_SHA`.

## Bulk imports

`imports/example-weapons.json` demonstrates the manifest format without becoming part of a game tree:

```json
{
  "Game": "hf-weapons",
  "Weapons": [
    {
      "Path": "Primary/AssaultRifle",
      "Data": {
        "Id": "m4a1",
        "DisplayName": "M4A1",
        "FireRate": 0.1
      }
    }
  ]
}
```

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

The importer validates the complete manifest and a prepared copy of the resulting game tree before its first source write. It rejects unknown games, duplicate IDs, absolute or traversing paths, filename-like category paths, updates without `--update`, and attempts to relocate an existing ID. Relocation requires a deliberate manual file move. Once validation succeeds, ordinary filesystem failures could still interrupt sequential writes; rerun the same manifest with `--update` after resolving the filesystem problem.

The importer never commits, pushes, or changes branches.

## Generated payloads

Each game produces its configured output under `dist/`. `hf-weapons` becomes `dist/hf-weapons.json`:

```json
{
  "FormatVersion": 1,
  "Game": "hf-weapons",
  "Source": {
    "Branch": "main",
    "Commit": "full-commit-sha"
  },
  "Weapons": {
    "Primary": {
      "AssaultRifle": {}
    },
    "Secondary": {}
  }
}
```

Directory names and weapon IDs are sorted deterministically. Empty source categories remain as empty objects, `Id` stays inside each indexed weapon object, output is UTF-8 two-space JSON with a trailing newline, and no timestamp is added. Given identical files and source metadata, output is byte-for-byte identical. Games are never merged into one payload.

Generated files are not committed. CI builds them for validation, and the Pages deployment builds them from the exact `main` commit being published.

## Adding another game

1. Add a new source directory anywhere inside the repository, normally as a top-level folder.
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

## GitHub Actions and Pages

The validation workflow runs for every pull request targeting `main` and on manual dispatch. It installs with `npm ci`, runs tests, validates the repository, builds all configured games with real commit metadata, and uploads `dist/` as an inspectable artifact. Superseded runs on the same pull request are cancelled.

The Pages workflow runs after pushes to `main` and on manual dispatch. It repeats tests and validation, builds every payload with branch `main` and the full `GITHUB_SHA`, adds `.nojekyll`, and deploys only `dist/` using GitHub's official Pages actions. It does not commit generated files.

One-time repository setup is required: open **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**, and save. After the first successful deployment, the current payload is expected at:

<https://jrdonat.github.io/Apple-Sandwich-Weapons/hf-weapons.json>

## Troubleshooting

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
