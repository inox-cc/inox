import { createHash } from 'node:crypto'

import { compileSource } from '../../../compiler/core.ts'
import type { RenderedCompilerLibraryRegistry } from '../../../scripts/lib/compiler-library-registry.ts'

export type CompilerLibraryDeletionSnapshot = {
  fingerprint: string
  librarySetHash: string
  registryHash: string
  manifestHash: string
  nativePlanHash: string
  nativePlanCMakeHash: string
  neutralCodeHash: string
  neutralRuntimeRequirements: string[]
}

export function compilerLibraryDeletionSnapshot(
  rendered: RenderedCompilerLibraryRegistry
): CompilerLibraryDeletionSnapshot {
  const neutral = compileSource('const answer = 40 + 2\n', { libraries: rendered.librarySet })

  return {
    fingerprint: rendered.librarySet.fingerprint,
    librarySetHash: sha256(JSON.stringify(rendered.librarySet)),
    registryHash: sha256(rendered.registrySource),
    manifestHash: sha256(rendered.manifestSource),
    nativePlanHash: sha256(rendered.nativePlanSource),
    nativePlanCMakeHash: sha256(rendered.nativePlanCMakeSource),
    neutralCodeHash: sha256(neutral.code),
    neutralRuntimeRequirements: neutral.ir.runtimeRequirements.slice().sort()
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
