import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { cp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { promisify } from 'node:util'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import type { DiscoveredCompilerLibrary } from '../../scripts/lib/compiler-library-discovery.ts'
import { renderCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'
import {
  compilerLibraryDeletionApiProbe,
  runCompilerLibraryDeletionApiProbe,
  type CompilerLibraryDeletionApiProbe,
  type CompilerLibraryDeletionApiProbeResult
} from './helpers/compiler-library-deletion-api-probe.ts'
import {
  compilerLibraryDeletionSnapshot,
  type CompilerLibraryDeletionSnapshot
} from './helpers/compiler-library-deletion-snapshot.ts'

type DeletionProbeResult = {
  ids: string[]
  snapshot?: CompilerLibraryDeletionSnapshot
  apiProbe?: CompilerLibraryDeletionApiProbeResult
  error?: string
  phase?: 'discovery' | 'render'
}

const execFileAsync = promisify(execFile)
const fixtureRoot = resolve('dist/test-tmp/compiler-library-full-tree-deletion-audit')
const probePath = resolve('tests/architecture/helpers/compiler-library-deletion-probe.ts')

test('изолированное удаление каждого stdlib package точно перестраивает оставшийся profile', async () => {
  await rm(fixtureRoot, { recursive: true, force: true })
  const original = await discoverCompilerLibraries()
  const originalLibrarySet = renderCompilerLibraryRegistry(original).librarySet
  const targets: Array<{
    library: DiscoveredCompilerLibrary
    apiProbe: CompilerLibraryDeletionApiProbe
  }> = []

  for (const library of original) {
    const apiProbe = await compilerLibraryDeletionApiProbe(library)

    assert.deepEqual(
      runCompilerLibraryDeletionApiProbe(apiProbe.source, originalLibrarySet).diagnosticCodes,
      apiProbe.presentDiagnosticCodes,
      `${library.id}: focused API probe is not active in the full profile`
    )
    targets.push({ library, apiProbe })
  }

  try {
    await mapConcurrent(targets, 4, async (target) => {
      await auditPackageDeletion(original, target.library, target.apiProbe)
    })
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

async function auditPackageDeletion(
  original: DiscoveredCompilerLibrary[],
  target: DiscoveredCompilerLibrary,
  apiProbe: CompilerLibraryDeletionApiProbe
): Promise<void> {
  const fixture = resolve(fixtureRoot, safeName(target.id))

  await cp(resolve('stdlib'), resolve(fixture, 'stdlib'), { recursive: true })

  try {
    const directlyRemoved = original.filter(
      (library) => library.root === target.root || library.root.startsWith(`${target.root}/`)
    )
    const directlyRemovedIds = new Set(directlyRemoved.map((library) => library.id))
    const directlyRemaining = original.filter((library) => !directlyRemovedIds.has(library.id))

    await rm(resolve(fixture, target.root), { recursive: true, force: true })

    const directResult = await runDeletionProbe(fixture, apiProbe)

    assert.deepEqual(directResult.ids, libraryIds(directlyRemaining), `${target.id}: direct inventory differs`)
    assertExpectedRenderResult(target.id, directlyRemaining, directResult, apiProbe)

    const removedClosure = dependentClosure(original, directlyRemovedIds)
    const removedClosureIds = new Set(removedClosure.map((library) => library.id))
    const remainingClosure = original.filter((library) => !removedClosureIds.has(library.id))

    for (const root of topLevelRoots(removedClosure)) {
      await rm(resolve(fixture, root), { recursive: true, force: true })
    }

    const closureResult = await runDeletionProbe(fixture, apiProbe)

    assert.deepEqual(closureResult.ids, libraryIds(remainingClosure), `${target.id}: closure inventory differs`)
    assert.equal(closureResult.phase, undefined, `${target.id}: closure failed in ${closureResult.phase}`)
    assert.equal(closureResult.error, undefined, `${target.id}: ${closureResult.error}`)
    assert.deepEqual(
      closureResult.apiProbe?.diagnosticCodes,
      apiProbe.absentDiagnosticCodes,
      `${target.id}: focused API semantics survived closure removal`
    )
    assert.deepEqual(
      closureResult.snapshot,
      compilerLibraryDeletionSnapshot(renderCompilerLibraryRegistry(remainingClosure)),
      `${target.id}: registry/native-plan/neutral compilation differs after closure removal`
    )
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
}

function assertExpectedRenderResult(
  targetId: string,
  remaining: DiscoveredCompilerLibrary[],
  actual: DeletionProbeResult,
  apiProbe: CompilerLibraryDeletionApiProbe
): void {
  let expected: CompilerLibraryDeletionSnapshot | null = null
  let expectedError: string | null = null

  try {
    expected = compilerLibraryDeletionSnapshot(renderCompilerLibraryRegistry(remaining))
  } catch (error) {
    expectedError = error instanceof Error ? error.message : String(error)
  }

  if (expectedError !== null) {
    assert.equal(actual.phase, 'render', `${targetId}: dependency error must occur after discovery`)
    assert.equal(actual.error, expectedError, `${targetId}: dependency diagnostic differs`)
    assert.equal(actual.snapshot, undefined, `${targetId}: invalid direct profile was rendered`)
    return
  }

  assert.equal(actual.phase, undefined, `${targetId}: direct removal failed in ${actual.phase}`)
  assert.equal(actual.error, undefined, `${targetId}: ${actual.error}`)
  assert.deepEqual(actual.snapshot, expected, `${targetId}: direct profile differs`)
  assert.deepEqual(
    actual.apiProbe?.diagnosticCodes,
    apiProbe.absentDiagnosticCodes,
    `${targetId}: focused API semantics survived direct removal`
  )
}

async function runDeletionProbe(
  projectRoot: string,
  apiProbe: CompilerLibraryDeletionApiProbe
): Promise<DeletionProbeResult> {
  const result = await execFileAsync(process.execPath, [probePath, projectRoot, JSON.stringify(apiProbe)], {
    cwd: resolve('.'),
    maxBuffer: 1024 * 1024
  })

  return JSON.parse(result.stdout) as DeletionProbeResult
}

function dependentClosure(
  libraries: DiscoveredCompilerLibrary[],
  directlyRemovedIds: Set<string>
): DiscoveredCompilerLibrary[] {
  const removedIds = new Set(directlyRemovedIds)
  let changed = true

  while (changed) {
    changed = false

    for (const library of libraries) {
      const dependencies = library.compilerPackage?.dependencies ?? []

      if (!removedIds.has(library.id) && dependencies.some((dependency) => removedIds.has(dependency))) {
        removedIds.add(library.id)
        changed = true
      }
    }
  }

  return libraries.filter((library) => removedIds.has(library.id))
}

function topLevelRoots(libraries: DiscoveredCompilerLibrary[]): string[] {
  const roots = Array.from(new Set(libraries.map((library) => library.root)))

  return roots
    .filter((root) => !roots.some((candidate) => candidate !== root && root.startsWith(`${candidate}/`)))
    .sort()
}

function libraryIds(libraries: DiscoveredCompilerLibrary[]): string[] {
  return libraries.map((library) => library.id).sort()
}

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '-')
}

async function mapConcurrent<T>(
  values: T[],
  concurrency: number,
  callback: (value: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex
      nextIndex = nextIndex + 1
      await callback(values[currentIndex])
    }
  }

  const workers: Promise<void>[] = []

  for (let index = 0; index < concurrency; index = index + 1) {
    workers.push(worker())
  }

  await Promise.all(workers)
}
