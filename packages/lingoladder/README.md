---
description: "The LingoLadder profile for dsh: an AI English tutor with study materials, listening/speaking/reading/writing practice pages, placement assessment, and a gamified dashboard driven by configurable agent skills."
kind: "package-bundle"
---

# @deepseek-ai/dsh-lingoladder

English | [中文](README.zh.md)

## Summary

This package is the LingoLadder profile of the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a local web app where an AI tutor digests study materials, builds a vocabulary bank, and drills you on four skills — listening, speaking, reading, and writing — each with a dedicated practice page. A placement assessment sets your CEFR level, a gamified dashboard tracks XP, streaks, and per-skill accuracy from real learning records, and every agent skill can be toggled from the settings page. You rarely install this package directly — this repository ships it into a dsh profile with `pnpm run ship`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Build this bundle into a local dsh profile, provide a DeepSeek API key, and launch the profile — the first run creates everything it needs under your home directory and opens the dashboard in your browser.

### Install and run

```sh
# from the root of this repository
export DEEPSEEK_API_KEY=sk-…        # or put it in a .env file in the directory you launch from
pnpm start                          # build, install into ~/.dsh/profiles/lingoladder, launch
```

`ship` copies this package (patch layer, plugin, skills, built dashboard) into the profile's dependencies; see the [repository README](../../README.md) for why the install is a copy rather than a link. The harness executable comes from the pinned `dsh/` submodule — `pnpm start` fetches and builds it on the first run.

The first launch prints a tokenized URL (for example `http://127.0.0.1:4000/?token=…`) and opens your browser. `--host`, `--port`, and `--no-open` change the binding, port, and browser behavior. All learner data — materials, vocabulary, progress, session documents, and speech audio caches — lives under `$DSH_HOME/lingoladder/.lingoladder/` (`~/.dsh/lingoladder/.lingoladder/` by default), so it stays put whichever directory you launch from.

### The practice pages

The dashboard's four ability cards and the toolbar open one full-screen practice page per skill. Listening plays a tutor-written passage through neural speech and hides the text until you answer; speaking records your repeat-after attempts and scores them with browser speech recognition; reading and writing run as a comprehension quiz and a graded essay. Every round lands as a learning record, which feeds the XP, streak, and accuracy read-outs without any manual bookkeeping. The placement assessment (first-run offer, rerunnable from settings) sets the level every page generates against.

### Skills configuration

Settings → 技能配置 lists every agent skill the tutor uses with its description and trigger condition, each with a toggle. A disabled skill disappears from the tutor's catalog on the next conversation turn; the toggle choice persists in your settings. Practice pages and the placement assessment depend on their skills — the panel calls out those impacts inline.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bundle is a Cordis patch layer plus one dashboard plugin. The patch mounts the web server, the chat connection, the workspace registry, and this plugin; the plugin owns the tutor agent, the preset skills, and every HTTP endpoint the browser talks to.

### Composition mechanics

The profile boots `@deepseek-ai/dsh-base` (the shared core: model access, tools, sessions, settings, skills) and then this bundle's [`cordis.patch.yml`](cordis.patch.yml), which inserts the web surface rows and reconfigures `tool-web` to enable direct fetching for material search. The five skills ship in this package's `skills/` directory and are registered as a skill root at runtime, filtered by the settings-driven skill configuration.

### Data and state

Tutor-visible state is agent-written JSON under `.lingoladder/`: one file per learning record, a vocabulary bank per material, the learner profile, and per-page session documents that a practice round consumes. The bundle classifies the agent's `write` calls against those document contracts and projects them to the browser as SSE events; practice pages grade locally and report outcomes through REST endpoints that write the same record shape.

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The bundle substance: web surface rows and the `tool-web` reconfiguration |
| [`src/index.ts`](src/index.ts) | The dashboard plugin: tutor agent, preset skills, HTTP endpoints, SSE projection |
| [`src/listening.ts`](src/listening.ts) | Listening quiz document parsing and write classification |
| [`src/speaking.ts`](src/speaking.ts) | Speaking line document parsing and write classification |
| [`src/reading.ts`](src/reading.ts) | Reading quiz document parsing and write classification |
| [`src/writing.ts`](src/writing.ts) | Writing assignment/result document parsing and write classification |
| [`src/tts.ts`](src/tts.ts) | Edge neural speech synthesis with a disk cache |
| [`src/skill-catalog.ts`](src/skill-catalog.ts) | Skill frontmatter parsing and the disabled-skills merge |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These references live in the pinned `dsh/` submodule that hosts the runtime:

- [app-boot profile section](../../dsh/packages/boot/app-boot/README.md) — how profiles are resolved, layered, and customized.
- [Model Experience contract](../../dsh/.agents/notes/implemented/process/2026-07-12-package-model-experience-contract.md) — what this page's Model Experience section is contracted to carry.

-----

<a id="model-experience"></a>
## Model Experience

### Skill catalog

#### What the model sees

The tutor's `skill` tool and the per-turn catalog message carry the five preset skills — each skill's kebab-case name, routing description, and trigger condition — filtered to the skills the learner has not disabled in the dashboard settings. The catalog is republished only when the enabled set changes.

#### Token effect

Catalog republication is digest-deduplicated: an unchanged skill set costs no repeated tokens, and toggling one skill rewrites the catalog message once with the new set.

#### KV Cache effect

The digest-based republication keeps the conversation prefix cacheable between ordinary turns; a catalog rewrite invalidates the prefix from the rewritten message onward, and later turns re-cache from that point.

### Loaded skills and practice rounds

#### What the model sees

When the tutor invokes a skill it receives that skill's full `SKILL.md` body, and each practice page sends one standardized generation or grading prompt as a learner message; the tutor's replies stay ordinary chat text.

#### Token effect

A loaded skill adds its `SKILL.md` body once per invocation, and a practice round adds one short prompt plus one confirmation or grading reply; no other model-visible input is added.

#### KV Cache effect

A loaded skill's body persists in the conversation history and keeps the prefix cacheable; practice-round messages append normally without rewriting earlier context.

## Known Limitations and Deferred Work

These limits tell you when the profile needs extra care or a capability degrades. They are current package constraints, not a general comparison or a task backlog.

- **Speech playback depends on Microsoft's Edge Read Aloud service** — an undocumented endpoint that could change; when it is unreachable the pages fall back to system speech of varying quality and say so.
- **The web server is a local single-user surface** — it binds `127.0.0.1` by default and fences the browser with a one-token URL; there is no multi-user account model.
- **All learner data lives unencrypted under `$DSH_HOME/lingoladder/.lingoladder/`**; back up or clear that directory as you would any local files.
- **Speaking scores are recognition-based** — the browser's speech recognition grades repeat-after fidelity by word overlap, which measures pronunciation accuracy only indirectly, and self-assessment replaces it where the API is missing.
- **`--no-open` needs a current installation** — older installed copies parsed the flag but always opened a browser; update the CLI to honor it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The skills are read from this package's own `skills/` directory (`resolvePresetSkillsDir` in [`src/index.ts`](src/index.ts)), which is why a profile-installed copy carries them; no agent preset is involved.

</details>
