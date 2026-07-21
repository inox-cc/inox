import process from 'node:process'

import { discoverCompilerLibraries } from '../../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../../scripts/lib/compiler-library-registry.ts'
import { compilerLibraryDeletionSnapshot } from './compiler-library-deletion-snapshot.ts'

const projectRoot = process.argv[2]

if (typeof projectRoot !== 'string') {
  throw new Error('compiler library deletion probe requires a project root')
}

try {
  const discovered = await discoverCompilerLibraries(projectRoot)
  const ids = discovered.map((library) => library.id)

  try {
    const rendered = renderCompilerLibraryRegistry(discovered)

    process.stdout.write(`${JSON.stringify({ ids, snapshot: compilerLibraryDeletionSnapshot(rendered) })}\n`)
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ids, error: errorMessage(error), phase: 'render' })}\n`)
  }
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ids: [], error: errorMessage(error), phase: 'discovery' })}\n`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
