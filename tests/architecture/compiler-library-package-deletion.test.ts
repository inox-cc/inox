import assert from 'node:assert/strict'
import { cp, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import {
  createCompilerLibrarySetFromDiscovered,
  generateCompilerLibraryRegistry
} from '../../scripts/lib/compiler-library-registry.ts'

const fixtureRoot = resolve('dist/test-tmp/compiler-library-package-deletion')
const outputRoot = resolve(fixtureRoot, 'dist/compiler-libraries')

test('удаление node:os из полного дерева оставляет рабочий профиль без его API и native pieces', async () => {
  await rm(fixtureRoot, { recursive: true, force: true })
  await cp(resolve('stdlib'), resolve(fixtureRoot, 'stdlib'), { recursive: true })

  try {
    await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

    const before = await readGeneratedPlans()
    assert.match(before.manifest, /node:os/)
    assert.match(before.manifest, /node:path/)
    assert.match(before.nativePlan, /stdlib\/node\/os\/src\/os\.cc/)
    assert.match(before.nativePlanCMake, /stdlib\/node\/os\/src\/os\.cc/)
    assert.match(before.registry, /stdlib\/node\/os\/compiler\/index\.ts/)

    await rm(resolve(fixtureRoot, 'stdlib/node/os'), { recursive: true, force: true })
    await generateCompilerLibraryRegistry(fixtureRoot, outputRoot)

    const after = await readGeneratedPlans()
    assert.doesNotMatch(after.manifest, /node:os/)
    assert.match(after.manifest, /node:path/)
    assert.doesNotMatch(after.nativePlan, /stdlib\/node\/os/)
    assert.doesNotMatch(after.nativePlanCMake, /stdlib\/node\/os/)
    assert.doesNotMatch(after.registry, /stdlib\/node\/os/)

    const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries(fixtureRoot))
    const neutralResult = compileSource('const answer = 40 + 2\n', { libraries })

    assert.doesNotMatch(neutralResult.code, /inox\/os\.h|os\.platform/)
    assert.equal(neutralResult.ir.runtimeRequirements.includes('node:os'), false)
    assert.throws(
      () => compileSource("import { platform } from 'node:os'\nplatform()\n", { libraries }),
      (error: unknown) =>
        error instanceof CompileError &&
        error.diagnostics[0].code === 'INOX_UNSUPPORTED_IMPORT_SOURCE' &&
        error.diagnostics[0].message === 'only relative imports are implemented, got node:os'
    )
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true })
  }
})

async function readGeneratedPlans(): Promise<{
  manifest: string
  nativePlan: string
  nativePlanCMake: string
  registry: string
}> {
  return {
    manifest: await readFile(resolve(outputRoot, 'default-registry.json'), 'utf8'),
    nativePlan: await readFile(resolve(outputRoot, 'native-plan.json'), 'utf8'),
    nativePlanCMake: await readFile(resolve(outputRoot, 'native-plan.cmake'), 'utf8'),
    registry: await readFile(resolve(outputRoot, 'default-registry.ts'), 'utf8')
  }
}
