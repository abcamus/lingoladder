# LingoLadder

Standalone English-learning agent product built as a profile bundle on top of
[DeepSeek Harness](../dsh). The agent digests learning materials, banks
vocabulary, and drives listening, speaking, reading, and writing practice
through a local web surface.

## Layout

```
packages/lingoladder/      @deepseek-ai/dsh-lingoladder — cordis profile bundle
  cordis.patch.yml           composition patch over the dsh base profile
  skills/                    five agent skills (digest, extract, search, exercises)
  src/                       HTTP surface: chat SSE, TTS, PDF, placement, practice
apps/lingoladder-web/      @deepseek-ai/dsh-lingoladder-web — React frontend
tsconfig.base.json         source-plane aliases into ../dsh (development only)
```

## Development against a local dsh checkout

`@deepseek-ai/dsh-*` packages are not consumed from npm yet. TypeScript and
vitest resolve them through `tsconfig.base.json`, whose paths point at
`../dsh/packages/**/src` and `../dsh/vendor/**/src`. Keep the sibling checkout
current; after pulling dsh, its `pnpm install && pnpm run build` output backs
runtime resolution.

```sh
pnpm install
pnpm run typecheck   # tsc --noEmit per package, aliased to dsh sources
pnpm run test        # bundle unit tests
pnpm run build       # tsdown bundle + vite frontend
```

Running the product still launches from the dsh checkout until the harness
packages are published:

```sh
cd ../dsh && pnpm dsh --profile lingoladder
```

## Switching to published packages (after dsh releases)

1. Replace the `tsconfig.base.json` alias facade with real dependencies:
   add each consumed `@deepseek-ai/dsh-*` package to the package that imports it.
2. Delete the alias file's `paths` entries; resolution moves to package exports.
3. dsh upgrades then become ordinary dependency version bumps.
