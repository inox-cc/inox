import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

import { runCompilerCli, type CliEnvironment } from '../../compiler/cli.ts'
import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'

test('CLI emits an exact C++ build manifest for the compiled module graph', async () => {
  await mkdir('dist/test-tmp', { recursive: true })
  const workspace = resolve(await mkdtemp('dist/test-tmp/inox-cli-manifest-'))
  const entry = join(workspace, 'src/index.ts')
  const dependency = join(workspace, 'src/value.ts')
  const outDir = join(workspace, 'generated')
  const manifestPath = join(workspace, 'inox-build.json')
  let exitCode = 0

  try {
    await mkdir(join(workspace, 'src'), { recursive: true })
    await writeFile(entry, "import { value } from './value.ts'\nvalue()\n")
    await writeFile(dependency, 'export function value(): number { return 1 }\n')

    const environment: CliEnvironment = {
      args: ['node', 'inox', entry, '--emit', 'cc', '--out-dir', outDir, '--entry', '--build-manifest', manifestPath],
      cwd: workspace,
      error() {},
      log() {},
      mkdirSync: (path) => fs.mkdirSync(path, { recursive: true }),
      setExitCode: (code) => {
        exitCode = code
      },
      writeFileSync: (path, source) => fs.writeFileSync(path, source)
    }

    runCompilerCli(createCompilerLibrarySet([]), environment)

    assert.equal(exitCode, 0)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      version: number
      inputFiles: string[]
      sourceFiles: string[]
      headerFiles: string[]
      declarationFiles: string[]
      cmakeCacheEntries: Array<{ name: string; value: string }>
    }

    assert.equal(manifest.version, 1)
    assert.deepEqual(manifest.cmakeCacheEntries, [])
    assert.deepEqual(manifest.inputFiles.sort(), [entry, dependency].sort())
    assert.deepEqual(manifest.sourceFiles.sort(), [join(outDir, 'src/index.cc'), join(outDir, 'src/value.cc')].sort())
    assert.deepEqual(manifest.headerFiles.sort(), [join(outDir, 'src/index.h'), join(outDir, 'src/value.h')].sort())
    assert.deepEqual(
      manifest.declarationFiles.sort(),
      [join(outDir, 'src/index.d.ts'), join(outDir, 'src/value.d.ts')].sort()
    )
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
