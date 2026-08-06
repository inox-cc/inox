import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { runCommand } from '../../scripts/lib/run-command.ts'

type CppBuildManifest = {
  version: number
  entry: string
  inputFiles: string[]
  sourceFiles: string[]
  headerFiles: string[]
  declarationFiles: string[]
}

export async function assertNativeInoxModularOutput(compilerPath: string): Promise<void> {
  const workspace = join(rootDir, 'dist/test-tmp/native-inox-modular-output')
  const inputDir = join(workspace, 'input')
  const input = join(inputDir, 'index.ts')
  const outDir = join(workspace, 'generated')
  const manifestPath = join(workspace, 'build-manifest.json')
  const generatedBase = join(outDir, 'dist/test-tmp/native-inox-modular-output/input/index')
  const sourcePath = `${generatedBase}.cc`
  const headerPath = `${generatedBase}.h`
  const declarationPath = `${generatedBase}.d.ts`

  try {
    await rm(workspace, { recursive: true, force: true })
    await mkdir(inputDir, { recursive: true })
    await writeFile(input, 'export function answer(): number { return 42 }\nconsole.log(answer())\n')

    const emit = await runCommand(compilerPath, [
      input,
      '--emit',
      'cc',
      '--out-dir',
      outDir,
      '--entry',
      '--build-manifest',
      manifestPath
    ])

    assert.equal(
      emit.code,
      0,
      `dist/inox modular emit failed\nstdout:\n${emit.stdout}\nstderr:\n${emit.stderr}`
    )
    assert.equal(emit.stderr, '')
    assert.equal(emit.stdout, `${outDir}\n`)

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as CppBuildManifest

    assert.equal(manifest.version, 1)
    assert.equal(manifest.entry, input)
    assert.deepEqual(manifest.inputFiles, [input])
    assert.deepEqual(manifest.sourceFiles, [sourcePath])
    assert.deepEqual(manifest.headerFiles, [headerPath])
    assert.deepEqual(manifest.declarationFiles, [declarationPath])

    await Promise.all([readFile(sourcePath), readFile(headerPath), readFile(declarationPath)])
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}
