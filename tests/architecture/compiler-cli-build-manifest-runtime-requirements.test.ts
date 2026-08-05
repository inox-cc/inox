import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

import { runCompilerCli, type CliEnvironment } from '../../compiler/cli.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('build manifest содержит замыкание используемых runtime requirements', async () => {
  await mkdir('dist/test-tmp', { recursive: true })
  const workspace = resolve(await mkdtemp('dist/test-tmp/inox-cli-runtime-manifest-'))
  const entry = join(workspace, 'index.ts')
  const outDir = join(workspace, 'generated')
  const manifestPath = join(workspace, 'build-manifest.json')

  try {
    await writeFile(entry, "console.log('hello')\n")
    const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
    const environment: CliEnvironment = {
      args: ['node', 'inox', entry, '--emit', 'cc', '--out-dir', outDir, '--entry', '--build-manifest', manifestPath],
      cwd: workspace,
      error() {},
      log() {},
      mkdirSync: (path) => fs.mkdirSync(path, { recursive: true }),
      setExitCode() {},
      writeFileSync: (path, source) => fs.writeFileSync(path, source)
    }

    runCompilerCli(libraries, environment)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      runtimeRequirements: string[]
    }

    assert.deepEqual(manifest.runtimeRequirements, [
      'global:collections#array',
      'global:console',
      'managed-values',
      'objects',
      'string-bytes'
    ])
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
