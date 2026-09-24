/**
 * Ship this repository's LingoLadder bundle into a local dsh profile so that
 * `dsh --profile lingoladder` runs THIS code.
 *
 * The harness comes from the `dsh/` submodule (a pinned commit) by default, so
 * a fresh clone needs no sibling checkout and no dsh source change; `--dsh
 * <path>` points at a live checkout instead, for development against
 * unreleased dsh work.
 *
 * The bundle is installed with pnpm's `file:` protocol, i.e. copied into the
 * profile directory rather than linked. That is deliberate: the harness's
 * `@deepseek-ai/cordis` is a vendored workspace package, and a linked checkout
 * resolves its externals against this repository's own npm copy, giving the
 * process a second cordis instance. Copied under the profile, the bundle walks
 * up into `$DSH_HOME/profiles/node_modules`, where dsh maintains symlinks to
 * the running installation, and shares its module instances.
 *
 * Usage: pnpm ship [--dsh <checkout>] [--profile <name>] [--run]
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SUBMODULE_DIR = join(REPO_ROOT, 'dsh')
/** Build records the dsh repository build writes at its root. */
const DSH_BUILD_MARKERS = ['tsconfig.host.tsbuildinfo', 'tsconfig.client.tsbuildinfo']

/** Argument value for `--flag <value>`, or undefined when absent. */
function flag(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

/** Run one command with inherited stdio; returns its exit code. */
function run(command, args, cwd, env) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: env === undefined ? process.env : { ...process.env, ...env },
  })
  if (result.error !== undefined) throw result.error
  return result.status ?? 1
}

/** Report a setup problem and stop before touching anything. */
function fail(message) {
  process.stderr.write(`ship: ${message}\n`)
  process.exit(1)
}

/** Whether `dir` holds a dsh checkout that can boot a profile. */
function isDshCheckout(dir) {
  return existsSync(join(dir, 'apps', 'cli', 'src', 'bin.ts'))
}

/**
 * The harness checkout to install into: an explicit `--dsh` path, else the
 * `dsh/` submodule, else the historical sibling checkout. A fresh clone has
 * the submodule recorded but not checked out, so fetching the pinned commit is
 * the one step every clone needs and ship performs it in place.
 */
function resolveDshCheckout() {
  const explicit = flag('--dsh')
  if (explicit !== undefined) {
    const dir = resolve(explicit)
    if (!isDshCheckout(dir)) fail(`no dsh checkout at ${dir} — expected apps/cli/src/bin.ts under it`)
    return { dir, submodule: false }
  }
  if (!isDshCheckout(SUBMODULE_DIR) && existsSync(join(REPO_ROOT, '.gitmodules'))) {
    const exit = run('git', ['submodule', 'update', '--init', 'dsh'], REPO_ROOT)
    if (exit !== 0) fail('git submodule update --init dsh failed — check the submodule URL in .gitmodules')
  }
  if (isDshCheckout(SUBMODULE_DIR)) return { dir: SUBMODULE_DIR, submodule: true }
  const sibling = resolve(dirname(REPO_ROOT), 'dsh')
  if (isDshCheckout(sibling)) {
    process.stdout.write(`ship: no dsh/ submodule checked out; using sibling checkout ${sibling}\n`)
    return { dir: sibling, submodule: false }
  }
  fail(`no dsh at ${SUBMODULE_DIR} or ${sibling} — run \`git submodule update --init\`, or pass --dsh <checkout>`)
}

/**
 * Environment for the harness install and build. dsh's root postinstall
 * installs developer git hooks, and it refuses to run inside a submodule —
 * git keeps the submodule's `core.worktree` in the common config, which is
 * what the hook installer migrates. The installer takes an explicit CI
 * opt-out for exactly this "no human is configuring hooks here" case, and
 * only that installer reads it: native helpers and allowlisted dependency
 * builds still run.
 */
const HARNESS_ENV = { CI: 'true' }

/**
 * Prepare the harness checkout. Profile plugin resolution loads the
 * installation's built packages, so a fresh submodule pays its workspace
 * install and build once here; an explicit `--dsh` checkout belongs to the
 * person running this, so ship reports what is missing instead of mutating it.
 */
function prepareDsh(dir, submodule) {
  const installMissing = !existsSync(join(dir, 'node_modules'))
  const buildMissing = DSH_BUILD_MARKERS.some(marker => !existsSync(join(dir, marker)))
  if (!installMissing && !buildMissing) return
  if (!submodule) {
    const steps = [
      installMissing ? `pnpm --dir ${dir} install` : undefined,
      buildMissing ? `pnpm --dir ${dir} run build` : undefined,
    ].filter(step => step !== undefined).join(' && ')
    fail(`checkout at ${dir} is not ready (${installMissing ? 'no node_modules' : 'not built'}) — run: ${steps}`)
  }
  if (installMissing) {
    process.stdout.write('ship: installing dsh dependencies (one-time; several minutes)\n')
    const exit = run('pnpm', ['install'], dir, HARNESS_ENV)
    if (exit !== 0) process.exit(exit)
  }
  if (buildMissing) {
    process.stdout.write('ship: building dsh (one-time; several minutes)\n')
    const exit = run('pnpm', ['run', 'build'], dir, HARNESS_ENV)
    if (exit !== 0) process.exit(exit)
  }
}

/**
 * This repository's own dev dependencies build the bundle and its frontend.
 * A bare clone that goes straight to `pnpm start` has none yet.
 */
function prepareRepo() {
  if (existsSync(join(REPO_ROOT, 'node_modules'))) return
  process.stdout.write("ship: installing this repository's dependencies (one-time)\n")
  const exit = run('pnpm', ['install'], REPO_ROOT)
  if (exit !== 0) process.exit(exit)
}

/**
 * Copy the profile templates in.
 *
 * `package.json` and `cordis.patch.yml` hold the person's own choices — an
 * installed layer list they may have trimmed, and their patch overrides — so
 * an existing one is left alone. `pnpm-workspace.yaml` is mechanical build
 * configuration this repository owns, and rewriting it is what keeps the
 * linker and the allowlisted lifecycle scripts correct after an upgrade.
 */
function seedTemplates(profileDir) {
  const templateDir = join(REPO_ROOT, 'profile')
  for (const file of readdirSync(templateDir)) {
    const target = join(profileDir, file)
    const existed = existsSync(target)
    if (existed && file !== 'pnpm-workspace.yaml') continue
    copyFileSync(join(templateDir, file), target)
    process.stdout.write(`ship: ${existed ? 'refreshed' : 'created'} ${target}\n`)
  }
}

/** Bundle paths the installed copy must match: the manifest's `files` payload and the entry it names. */
const BUNDLE_PAYLOAD = ['lib', 'cordis.patch.yml', 'skills', 'web']

/**
 * Bring the installed copy up to date with this repository's build.
 *
 * pnpm installs a `file:` dependency as a hard-linked copy and then considers
 * the recorded directory current on every later install, so anything that
 * changes an inode — an edited `cordis.patch.yml`, a checkout replacing
 * `skills/` — would otherwise leave the profile running the previous build.
 */
function refreshInstalledBundle(sourceDir, installedDir) {
  if (!existsSync(installedDir)) return
  for (const entry of BUNDLE_PAYLOAD) {
    const source = join(sourceDir, entry)
    if (!existsSync(source)) continue
    const target = join(installedDir, entry)
    // Node's copy refuses to overwrite the multi-link files pnpm installs, so
    // the stale copy goes first and the entry is rebuilt from this build.
    rmSync(target, { recursive: true, force: true })
    cpSync(source, target, { recursive: true })
  }
  process.stdout.write(`ship: refreshed ${installedDir}\n`)
}

const profileName = flag('--profile') ?? 'lingoladder'
const profileDir = join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'profiles', profileName)
const bundleDir = join(REPO_ROOT, 'packages', 'lingoladder')
const { dir: dshDir, submodule } = resolveDshCheckout()

prepareDsh(dshDir, submodule)

prepareRepo()
const buildExit = run('pnpm', ['run', 'build'], REPO_ROOT)
if (buildExit !== 0) process.exit(buildExit)

mkdirSync(profileDir, { recursive: true })
seedTemplates(profileDir)

// The checkout's built CLI is invoked directly: `pnpm --dir <checkout> dsh`
// would re-check the checkout's dependencies first, which runs the harness's
// postinstall git-hook installer inside the submodule.
const cli = join(dshDir, 'apps', 'cli', 'lib', 'bin.js')
const installedBundleDir = join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-lingoladder')

// `dsh plugin` forwards to pnpm in the profile directory and then reconciles
// `dsh.profile.bundles`, so the layer list always names what is installed.
const addExit = run('node', [cli, 'plugin', '--profile', profileName, 'add', `file:${bundleDir}`], REPO_ROOT)
if (addExit !== 0) process.exit(addExit)

refreshInstalledBundle(bundleDir, installedBundleDir)

process.stdout.write(
  `ship: ${bundleDir}\n`
  + `ship:  -> ${installedBundleDir}\n`,
)

if (process.argv.includes('--run')) {
  process.stdout.write(`ship: starting dsh --profile ${profileName}\n`)
  process.exit(run('node', [cli, '--profile', profileName], REPO_ROOT))
}

process.stdout.write(`ship: run it with: pnpm start   (or: node ${cli} --profile ${profileName})\n`)
