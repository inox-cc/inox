import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:fs operations lower only through package descriptors', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import fs, { constants, promises as fsPromises, readFileSync } from 'node:fs'\n" +
      "import promisesDefault, { readFile } from 'node:fs/promises'\n" +
      "const path = '/tmp/item'\n" +
      'const bytes = readFileSync(path)\n' +
      "const text = fs.readFileSync(path, 'utf8')\n" +
      "const names = fs.readdirSync(path, { encoding: 'utf8' })\n" +
      'const entries = fs.readdirSync(path, { withFileTypes: true })\n' +
      'const entry = entries[0]\n' +
      'const stats = fs.statSync(path)\n' +
      'console.log(bytes, text, names, entry.name, entry.isFile(), stats.size, stats.isDirectory(), constants.F_OK)\n' +
      'fs.mkdirSync(path, { recursive: true })\n' +
      'fs.rmSync(path, { recursive: true, force: true })\n' +
      'fs.writeFileSync(path, bytes)\n' +
      "await fs.promises.readFile(path, 'utf8')\n" +
      "await fsPromises.readFile(path, 'utf8')\n" +
      "await promisesDefault.readFile(path, 'utf8')\n" +
      "await readFile(path, 'utf8')\n",
    { libraries }
  )
  const operationIds = collectOperationIds(result.ir)

  assert.ok(operationIds.includes('node:fs#readFileSync'))
  assert.ok(operationIds.includes('node:fs#readdirSync'))
  assert.ok(operationIds.includes('node:fs#Stats.isDirectory'))
  assert.ok(operationIds.includes('node:fs#Dirent.isFile'))
  assert.ok(operationIds.includes('node:fs#constants.F_OK'))
  assert.equal(operationIds.filter((id) => id === 'node:fs/promises#readFile').length, 4)

  assert.match(result.code, /fs\.readFileSync\(path\)/)
  assert.match(result.code, /fs\.readFileSync\(path, "utf8"\)/)
  assert.match(result.code, /fs\.readdirSync\(path, FsReadDirOptions\{true\}\)/)
  assert.match(result.code, /fs\.constants\.F_OK/)
  assert.match(result.code, /fs\.writeFileSync\(path, Uint8Array\(bytes\)\)/)
  assert.equal(result.code.includes('readFileBytes'), false)
  assert.equal(result.code.includes('readdirDirents'), false)
})

function collectOperationIds(value: unknown): string[] {
  const result: string[] = []
  visit(value, result)
  return result
}

function visit(value: unknown, operationIds: string[]): void {
  if (value === null || typeof value !== 'object') {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, operationIds)
    }
    return
  }

  const record = value as Record<string, unknown>
  const operationId = record.libraryOperationId

  if (typeof operationId === 'string') {
    operationIds.push(operationId)
  }

  for (const key of Object.keys(record)) {
    visit(record[key], operationIds)
  }
}
