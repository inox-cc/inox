import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { test } from 'node:test'

import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'

const projectRoot = resolve('.')

test('target runtime configuration не маскируется под global stdlib package', async () => {
  assert.equal(existsSync(resolve('stdlib/global/platform')), false)

  const discovered = await discoverCompilerLibraries()

  assert.equal(discovered.some((library) => library.id === 'global:platform'), false)

  const forbidden: string[] = []

  for (const root of ['compiler', 'scripts', 'stdlib']) {
    for (const file of typescriptFiles(resolve(root))) {
      if (readFileSync(file, 'utf8').includes('global:platform')) {
        forbidden.push(projectPath(file))
      }
    }
  }

  assert.deepEqual(forbidden, [])
})

function typescriptFiles(directory: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...typescriptFiles(path))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path)
    }
  }

  return files.sort()
}

function projectPath(path: string): string {
  return relative(projectRoot, path).split(sep).join('/')
}
