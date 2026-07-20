import assert from 'node:assert/strict'
import { cp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import type { DiscoveredCompilerLibrary } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibrarySetFromDiscovered,
  renderCompilerLibraryRegistry
} from '../../scripts/lib/compiler-library-registry.ts'

const fixtureRoot = resolve('dist/test-tmp/compiler-library-full-tree-deletion-audit')

test('физическое удаление каждого stdlib package убирает его из полного рабочего profile', async () => {
  await rm(fixtureRoot, { recursive: true, force: true })
  await cp(resolve('stdlib'), resolve(fixtureRoot, 'stdlib'), { recursive: true })

  const original = await discoverCompilerLibraries()

  try {
    for (const target of original) {
      const targetRoot = resolve(fixtureRoot, target.root)
      await rm(targetRoot, { recursive: true, force: true })

      const directlyRemoved = original.filter(
        (library) => library.root === target.root || library.root.startsWith(`${target.root}/`)
      )
      const directlyRemovedIds = new Set(directlyRemoved.map((library) => library.id))
      const directlyDiscovered = await discoverCompilerLibraries(fixtureRoot)
      const missingEdges = missingDependencyEdges(directlyDiscovered, directlyRemovedIds)

      if (missingEdges.length > 0) {
        assert.throws(
          () => createCompilerLibrarySetFromDiscovered(directlyDiscovered),
          /Missing compiler library dependency/,
          `${target.id}: missing dependency was not rejected (${missingEdges.join(', ')})`
        )
      }

      const removed = target.kind === 'node' ? dependentClosure(original, directlyRemovedIds) : directlyRemoved
      const removedIds = new Set(removed.map((library) => library.id))
      const removedRequirementIds = runtimeRequirementIds(removed)

      for (const root of topLevelRoots(removed)) {
        if (root !== target.root) {
          await rm(resolve(fixtureRoot, root), { recursive: true, force: true })
        }
      }

      const discovered = await discoverCompilerLibraries(fixtureRoot)
      const remainingIds = new Set(discovered.map((library) => library.id))

      for (const library of removed) {
        assert.equal(remainingIds.has(library.id), false, `${target.id}: ${library.id} remained discoverable`)
        assert.equal(
          discovered.some((candidate) =>
            candidate.nativeSources.some((source) => source.startsWith(`${library.root}/`))
          ),
          false,
          `${target.id}: ${library.id} native source remained in discovery`
        )
        assert.equal(
          discovered.some((candidate) =>
            candidate.nativeIncludeDirs.some((path) => path.startsWith(`${library.root}/`))
          ),
          false,
          `${target.id}: ${library.id} native include remained in discovery`
        )
      }

      const remainingMissingEdges = missingDependencyEdges(discovered, removedIds)

      if (remainingMissingEdges.length === 0) {
        const rendered = renderCompilerLibraryRegistry(discovered)

        assert.equal(
          rendered.librarySet.declarations.some((declaration) => removedIds.has(declaration.libraryId)),
          false,
          `${target.id}: declaration remained in selected library set`
        )
        assert.equal(
          rendered.librarySet.operations.some((operation) => removedIds.has(operation.libraryId)),
          false,
          `${target.id}: operation remained in selected library set`
        )
        assert.equal(
          rendered.librarySet.nativeTypes.some((nativeType) => removedIds.has(nativeType.libraryId)),
          false,
          `${target.id}: native type remained in selected library set`
        )
        assert.equal(
          rendered.librarySet.runtimeRequirements.some((requirement) =>
            removedRequirementIds.has(requirement.id)
          ),
          false,
          `${target.id}: runtime requirement remained in selected library set`
        )

        for (const library of removed) {
          assert.equal(
            rendered.nativePlanSource.includes(`${library.root}/`),
            false,
            `${target.id}: ${library.id} remained in generated native plan`
          )
        }

        if (target.kind === 'node' && target.importSource !== null) {
          const neutralResult = compileSource('const answer = 40 + 2\n', {
            libraries: rendered.librarySet
          })

          assert.equal(
            neutralResult.ir.runtimeRequirements.some((requirement) =>
              removedRequirementIds.has(requirement)
            ),
            false,
            `${target.id}: removed package requirement reached neutral IR`
          )
          assert.throws(
            () =>
              compileSource(
                `import removedPackage from '${target.importSource}'\nremovedPackage\n`,
                { libraries: rendered.librarySet }
              ),
            (error: unknown) =>
              error instanceof CompileError &&
              error.diagnostics[0].code === 'INOX_UNSUPPORTED_IMPORT_SOURCE',
            `${target.id}: removed import remained available`
          )
        }
      } else {
        assert.throws(
          () => createCompilerLibrarySetFromDiscovered(discovered),
          /Missing compiler library dependency/,
          `${target.id}: dependency closure remained invalid (${remainingMissingEdges.join(', ')})`
        )
      }

      for (const root of topLevelRoots(removed)) {
        await cp(resolve(root), resolve(fixtureRoot, root), { recursive: true })
      }
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

function missingDependencyEdges(
  discovered: DiscoveredCompilerLibrary[],
  removedIds: Set<string>
): string[] {
  return discovered.flatMap(
    (library) =>
      library.compilerPackage?.dependencies
        .filter((dependency) => removedIds.has(dependency))
        .map((dependency) => `${library.id} -> ${dependency}`) ?? []
  )
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

function runtimeRequirementIds(libraries: DiscoveredCompilerLibrary[]): Set<string> {
  return new Set(
    libraries.flatMap(
      (library) => library.compilerPackage?.runtimeRequirements.map((requirement) => requirement.id) ?? []
    )
  )
}
