import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

import { discoverStdlibTestFiles } from '../../scripts/lib/stdlib-test-discovery.ts'

export type LibraryIntegrationCompiler =
  | {
      kind: 'hosted'
    }
  | {
      kind: 'binary'
      path: string
    }

export interface LibraryIntegrationTest {
  readonly name: string
  readonly run: (compiler: LibraryIntegrationCompiler) => Promise<void>
}

export async function discoverLibraryIntegrationTests(): Promise<LibraryIntegrationTest[]> {
  const files = await discoverStdlibTestFiles('integration')
  const tests: LibraryIntegrationTest[] = []
  const names = new Set<string>()

  for (const file of files) {
    const module: unknown = await import(pathToFileURL(file).href)
    const integrationTest = libraryIntegrationTestExport(module, file)

    assert.ok(!names.has(integrationTest.name), `duplicate library integration test: ${integrationTest.name}`)
    names.add(integrationTest.name)
    tests.push(integrationTest)
  }

  return tests
}

function libraryIntegrationTestExport(module: unknown, file: string): LibraryIntegrationTest {
  assert.ok(isRecord(module), `${file}: integration test module must export an object`)

  const integrationTest = module.libraryIntegrationTest

  assert.ok(isRecord(integrationTest), `${file}: missing libraryIntegrationTest export`)
  assert.ok(
    typeof integrationTest.name === 'string' && integrationTest.name.length > 0,
    `${file}: integration test name must be a non-empty string`
  )
  assert.equal(typeof integrationTest.run, 'function', `${file}: integration test run must be a function`)

  return integrationTest as unknown as LibraryIntegrationTest
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
