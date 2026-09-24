/**
 * Route around the harness's profile resolver rejecting a request that narrows
 * to a builtin name.
 *
 * The resolver reduces a request to its package name first — `buffer/index`
 * becomes `buffer` — and then iterates `createRequire(parent).resolve.paths(name)`
 * without a null check. Node answers null for a builtin, so the narrowed name
 * makes importing msedge-tts throw `TypeError: createRequire.resolve.paths is
 * not a function or its return value is not iterable`: its CommonJS tree
 * requires `buffer/index`, and readable-stream requires `string_decoder/`. The
 * bundle is mid-import when that happens, so the profile starts with the whole
 * lingoladder entry inactive. The pinned dsh-v0.1.6-alpha.2 and upstream master
 * (46a7f68) both leave the iteration unguarded.
 *
 * Answering with the requesting module's own search paths keeps the resolver
 * looking where its caller wanted — the profile's node_modules, where the real
 * `buffer` and `string_decoder` packages the tree expects are installed — and
 * leaves non-builtin requests untouched.
 *
 * @module
 */
import Module from 'node:module'

/** Node's internal lookup-paths helper, which `require.resolve.paths` delegates to. */
interface LookupPathsInternals {
  _resolveLookupPaths: (
    this: unknown,
    request: string,
    parent: { paths?: readonly string[] | undefined } | undefined,
    isMain?: boolean,
  ) => string[] | null
}

let installed = false

/** Install the search-path fallback for builtin names; idempotent. */
export function installResolutionGuard(): void {
  if (installed) return
  installed = true
  const internals = Module as unknown as LookupPathsInternals
  const original = internals._resolveLookupPaths
  internals._resolveLookupPaths = function (request, parent, isMain) {
    const paths = original.call(this, request, parent, isMain)
    if (paths !== null) return paths
    const parentPaths = parent?.paths
    return parentPaths !== undefined && parentPaths.length > 0 ? [...parentPaths] : paths
  }
}
