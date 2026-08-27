# Apple Sandwich Weapons

This repository is the source of truth for game weapon statistics. Each configured game or weapon collection owns an independent directory tree of small, reviewable weapon JSON files. Node.js tooling validates those files and consolidates each game into a deterministic payload that GitHub Pages can serve.

Roblox and Luau integration are intentionally outside this repository's current scope.

## Current game hierarchy

`games.json` currently maps the stable slug `hf-weapons` to `HF - Weapons/`. The repository contains 152 live weapons extracted from the production `ReplicatedStorage.ToolInfo` model:

```text
HF - Weapons/
├── Primary/
│   ├── AssaultRifle/  (28 weapons)
│   ├── BattleRifle/   (15 weapons)
│   ├── Carbine/       (14 weapons)
│   ├── DMR/           (10 weapons)
│   ├── LMG/           (12 weapons)
│   ├── PDW/           (18 weapons)
│   ├── Shotgun/       (11 weapons)
│   └── Sniper/        (23 weapons)
└── Secondary/         (21 weapons)
```

Folder names are preserved exactly in generated payloads. A weapon's folder supplies its slot and category, so weapon files do not duplicate that information with `slot` or `category` fields.

Each file combines its live ToolInfo metadata—such as description, cost, game-pass status, and sprint-reload multiplier—with its settings module. Stable lowercase IDs were generated from the live display names. Luau `nil` values become JSON `null`, `Vector2` values become `{ "x", "y" }` objects, runtime-only `Module` references are omitted, and Roblox instance references are represented by stable string paths.

## Generated payloads

Each configured game produces one output under the ignored `dist/` directory. `hf-weapons` becomes `dist/hf-weapons.json`:

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
      "AssaultRifle": {
        "ak-12": {
          "Id": "ak-12",
          "DisplayName": "AK-12"
        }
      }
    },
    "Secondary": {
      "g17": {
        "Id": "g17",
        "DisplayName": "G17"
      }
    }
  }
}
```

Directory names and weapon IDs are sorted deterministically. Empty source categories remain as empty objects, `Id` stays inside each indexed weapon object, `null` is preserved, and no timestamp is added. Given identical files and source metadata, output is byte-for-byte identical. Configured games are never merged into one payload.

Generated files are not committed. CI builds them for validation, and the Pages deployment builds them from the exact `main` commit being published.

## GitHub Actions and Pages

The validation workflow runs for every pull request targeting `main` and on manual dispatch. It installs dependencies reproducibly, runs tests, validates the repository, builds all configured games with real commit metadata, and uploads `dist/` as an inspectable artifact.

The Pages workflow runs after pushes to `main` and on manual dispatch. It repeats tests and validation, builds every payload with branch `main` and the full `GITHUB_SHA`, adds `.nojekyll`, and deploys only `dist/` using GitHub's official Pages actions.

One-time repository setup is required: open **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**, and save. After the first successful deployment, the current payload is expected at:

<https://jrdonat.github.io/Apple-Sandwich-Weapons/hf-weapons.json>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for weapon-file rules, live Luau conversion guidance, local commands, bulk imports, future-game configuration, validation troubleshooting, and pull request expectations.
