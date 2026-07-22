import process from 'node:process'

import { discoverCompilerLibraries } from '../../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../../scripts/lib/compiler-library-registry.ts'
import {
  runCompilerLibraryDeletionApiProbe,
  type CompilerLibraryDeletionApiProbe
} from './compiler-library-deletion-api-probe.ts'
import { compilerLibraryDeletionSnapshot } from './compiler-library-deletion-snapshot.ts'

const projectRoot = process.argv[2]
const apiProbeSource = process.argv[3]

if (typeof projectRoot !== 'string' || typeof apiProbeSource !== 'string') {
  throw new Error('compiler library deletion probe requires a project root and API probe')
}

const apiProbe = JSON.parse(apiProbeSource) as CompilerLibraryDeletionApiProbe

try {
  const discovered = await discoverCompilerLibraries(projectRoot)
  const ids = discovered.map((library) => library.id)

  try {
    const rendered = renderCompilerLibraryRegistry(discovered)

    process.stdout.write(
      `${JSON.stringify({
        ids,
        snapshot: compilerLibraryDeletionSnapshot(rendered),
        apiProbe: runCompilerLibraryDeletionApiProbe(apiProbe.source, rendered.librarySet)
      })}\n`
    )
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ids, error: errorMessage(error), phase: 'render' })}\n`)
  }
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ids: [], error: errorMessage(error), phase: 'discovery' })}\n`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
