# LingoLadder

Standalone English-learning agent product built as a profile bundle on top of
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), which is
vendored as the `dsh/` submodule. The agent digests learning materials, banks
vocabulary, and drives listening, speaking, reading, and writing practice
through a local web surface.

## Layout

```
packages/lingoladder/      @deepseek-ai/dsh-lingoladder — cordis profile bundle
  cordis.patch.yml           composition patch over the dsh base profile
  skills/                    five agent skills (digest, extract, search, exercises)
  web/                       built dashboard, emitted here by the frontend build
  src/                       HTTP surface: chat SSE, TTS, PDF, placement, practice
apps/lingoladder-web/      React frontend; `vite build` writes into the bundle's web/
profile/                   the dsh profile this product owns (manifest + patch layer)
scripts/ship.mjs           build, then install the bundle into the local profile
dsh/                       harness submodule, pinned to one upstream commit
tsconfig.base.json         source-plane aliases into dsh/ (development only)
```

## Getting started

Only `git`, Node ≥ 24 and `pnpm` are needed:

```sh
pnpm start
```

`start` prepares everything on the first run: it installs this repository's
dependencies, fetches the `dsh/` submodule (a pinned upstream commit — no
LingoLadder code lives inside it), installs and builds the harness once
(several minutes), builds the bundle and its frontend, seeds the
`$DSH_HOME/profiles/lingoladder` profile, installs the bundle into that
profile, and launches the dashboard. Later runs reuse the built harness and
only rebuild this repository's code.

## Development against the harness checkout

`@deepseek-ai/dsh-*` packages are not consumed from npm yet. They come from the
`dsh/` submodule, pinned to the official `dsh-v0.1.6-alpha.2` tag so every clone
typechecks and boots against the same harness. That tag is the newest upstream
release this bundle still builds against: the 0.1.7 line replaced the settings
API the dashboard stores its added models and skill toggles through. TypeScript
and vitest resolve the packages through `tsconfig.base.json`, whose paths point
at the harness's built `lib/types` declarations — so the submodule must be
installed and built before either runs, which `pnpm ship` does.

```sh
git submodule update --init   # once per clone
pnpm run typecheck   # tsc --noEmit per package, aliased to the built dsh declarations
pnpm run test        # bundle unit tests
pnpm run build       # tsdown bundle + vite frontend into packages/lingoladder/web
```

Bumping the pinned commit swaps the harness sources under an already-built
checkout; clear the previous commit's outputs with `pnpm --dir dsh run clean`
before the next build, or its stale `lib/` entries fail the bundle step.

To develop against unreleased harness work, point `ship` at another checkout
with `pnpm ship --dsh ~/Workspace/dsh`. That checkout belongs to the person
running it, so ship installs and builds nothing there — it reports the missing
`pnpm install` / `pnpm run build` steps instead.

## Running

The harness executable lives in the dsh checkout, so the launcher is invoked
there — but every line of LingoLadder code comes from this repository, through
the profile:

```sh
pnpm start                                 # ship + launch, the normal entry point
pnpm run ship                              # build + install into ~/.dsh/profiles/lingoladder
node dsh/apps/cli/lib/bin.js --profile lingoladder   # launch without rebuilding
```

Both entry points run the checkout's built CLI. The direct `node` line above and
`ship` are the same invocation; going through `pnpm --dir dsh dsh` would only
make pnpm re-check the checkout's dependencies first.

`ship` installs the bundle with pnpm's `file:` protocol, i.e. it COPIES the
built package into the profile directory. Linking this checkout instead would
resolve the bundle's external imports (`@deepseek-ai/cordis`, `dsh-llm`,
`dsh-session`) against this repository's own npm copies, while the running
harness loads its vendored ones — two instances of the dependency-injection
core. Copied under the profile, the bundle falls through to
`$DSH_HOME/profiles/node_modules`, where dsh links the running installation,
and shares its module instances. Re-run `ship` after each change you want to
see; `pnpm --filter @deepseek-ai/dsh-lingoladder build --watch` narrows the
loop to the rebuild.

The profile directory itself is seeded from [`profile/`](profile/), so a fresh
machine needs only `pnpm start`. Learner data (materials, vocabulary,
progress, TTS cache) lives under `$DSH_HOME/lingoladder/.lingoladder/`, which
keeps the dashboard's reads and the agent's relative writes in the same place.

## Switching to published packages (after dsh releases)

1. Replace the `tsconfig.base.json` alias facade with real dependencies:
   add each consumed `@deepseek-ai/dsh-*` package to the package that imports it.
2. Delete the alias file's `paths` entries; resolution moves to package exports.
3. dsh upgrades then become ordinary dependency version bumps, and `ship`
   swaps its `file:` spec for the published package name.
