import Module, { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installResolutionGuard } from '../src/resolution-guard.ts'

const PARENT = join(import.meta.dirname, '..', 'src', 'tts.ts')
const requireFromSrc = createRequire(PARENT)
const nativeLookup = requireFromSrc.resolve.paths('msedge-tts') as string[]

// Node's own path chain for the parent's directory, cast because the internal
// helper has no type declaration.
const parentSearchPaths = (Module as unknown as { _nodeModulePaths(dir: string): string[] })
  ._nodeModulePaths(dirname(PARENT))

describe('installResolutionGuard', () => {
  it('answers a builtin name with the requesting module search paths', () => {
    installResolutionGuard()
    expect(requireFromSrc.resolve.paths('buffer')).toEqual(parentSearchPaths)
  })

  it('leaves a non-builtin lookup on Node search order', () => {
    installResolutionGuard()
    expect(requireFromSrc.resolve.paths('msedge-tts')).toEqual(nativeLookup)
  })
})
