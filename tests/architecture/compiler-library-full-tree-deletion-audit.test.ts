import assert from 'node:assert/strict'
import { cp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibrarySetFromDiscovered,
  renderCompilerLibraryRegistry
} from '../../scripts/lib/compiler-library-registry.ts'

const fixtureRoot = resolve('dist/test-tmp/compiler-library-full-tree-deletion-audit')

test('физическое удаление каждого stdlib package убирает его из полного generated profile', async () => {
  await rm(fixtureRoot, { recursive: true, force: true })
  await cp(resolve('stdlib'), resolve(fixtureRoot, 'stdlib'), { recursive: true })

  const original = await discoverCompilerLibraries()

  for (const target of original) {
    const targetRoot = resolve(fixtureRoot, target.root)
    await rm(targetRoot, { recursive: true, force: true })

    const discovered = await discoverCompilerLibraries(fixtureRoot)
    const removed = original.filter(
      (library) => library.root === target.root || library.root.startsWith(`${target.root}/`)
    )
    const removedIds = new Set(removed.map((library) => library.id))
    const remainingIds = new Set(discovered.map((library) => library.id))

    for (const library of removed) {
      assert.equal(remainingIds.has(library.id), false, `${target.id}: ${library.id} remained discoverable`)
      assert.equal(
        discovered.some((candidate) => candidate.nativeSources.some((source) => source.startsWith(`${library.root}/`))),
        false,
        `${target.id}: ${library.id} native source remained in discovery`
      )
      assert.equal(
        discovered.some((candidate) => candidate.nativeIncludeDirs.some((path) => path.startsWith(`${library.root}/`))),
        false,
        `${target.id}: ${library.id} native include remained in discovery`
      )
    }

    const missingEdges = discovered.flatMap(
      (library) =>
        library.compilerPackage?.dependencies
          .filter((dependency) => removedIds.has(dependency))
          .map((dependency) => `${library.id} -> ${dependency}`) ?? []
    )

    if (missingEdges.length > 0) {
      assert.throws(
        () => createCompilerLibrarySetFromDiscovered(discovered),
        /Missing compiler library dependency/,
        `${target.id}: missing dependency was not rejected (${missingEdges.join(', ')})`
      )
    } else {
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

      for (const library of removed) {
        assert.equal(
          rendered.nativePlanSource.includes(`${library.root}/`),
          false,
          `${target.id}: ${library.id} remained in generated native plan`
        )
      }
    }

    await cp(resolve(target.root), targetRoot, { recursive: true })
  }

  await rm(fixtureRoot, { recursive: true, force: true })
})
