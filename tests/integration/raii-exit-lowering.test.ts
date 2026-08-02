import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { rootDir } from '../../scripts/lib/repo-root.ts'
import { runCommand } from '../../scripts/lib/run-command.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertRaiiFunctionsUseDirectReturns(): void {
  const plainSource = compileEntry(`
function check(): void {
  const values = ['a']
  values.push('b')
  console.log(values.join(','))
}

check()
`)

  assert.match(plainSource, /if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(plainSource, /goto cleanup;|cleanup:/)

  const returningSource = compileEntry(`
function read(values: string[]): string {
  return values.join(',')
}

console.log(read(['a']))
`)

  assert.match(returningSource, /if \(inox::thrown\(\)\) return \{\};/)
  assert.match(returningSource, /return inox_library_result_\d+;/)
  assert.doesNotMatch(returningSource, /inox::String inox_return/)
  assert.doesNotMatch(returningSource, /goto cleanup;|cleanup:/)

  const moduleFiles = compileFiles([
    {
      path: '/pkg/src/index.ts',
      source: `
import { message } from './helper'
console.log(message)
`
    },
    {
      path: '/pkg/src/helper.ts',
      source: `
export const message = ['a'].join(',')
`
    }
  ])
  const helperSource = generatedTextFile(moduleFiles, 'src/helper.cc').code

  assert.match(helperSource, /if \(inox::thrown\(\)\) return;/)
  assert.doesNotMatch(helperSource, /goto cleanup;|cleanup:/)

  const boxedSource = compileEntry(`
function boxed(): void {
  let name = 'Ada'
  const callback: Function = () => {
    console.log(name)
  }
  callback()
}

boxed()
`)

  assert.match(boxedSource, /goto cleanup;/)
  assert.match(boxedSource, /cleanup:\n  inox_shared_value_box_release\(name\);/)
  assert.doesNotMatch(boxedSource, /inox_default_free\(0, name, /)
}

export async function assertNativeRaiiFunctionsUseDirectReturns(compilerPath: string): Promise<void> {
  const workspace = join(rootDir, 'dist/test-tmp/native-raii-cleanup-lowering')
  const input = join(workspace, 'index.ts')
  const outputCc = join(workspace, 'index.cc')

  try {
    await rm(workspace, {
      recursive: true,
      force: true
    })
    await mkdir(workspace, {
      recursive: true
    })
    await writeFile(
      input,
      `
function append(values: string[]): void {
  values.push('b')
}

function read(values: string[]): string {
  return values.join(',')
}

const values = ['a']
append(values)
console.log(read(values))
`
    )

    const emit = await runCommand(compilerPath, [input, outputCc])

    assert.equal(
      emit.code,
      0,
      `dist/inox RAII cleanup emit failed\nstdout:\n${emit.stdout}\nstderr:\n${emit.stderr}`
    )
    assert.equal(emit.stderr, '')

    const source = await readFile(outputCc, 'utf8')

    assert.match(source, /if \(inox::thrown\(\)\) return;/)
    assert.match(source, /if \(inox::thrown\(\)\) return \{\};/)
    assert.doesNotMatch(source, /goto cleanup;|cleanup:/)
  } finally {
    await rm(workspace, {
      recursive: true,
      force: true
    })
  }
}

function compileEntry(source: string): string {
  return generatedTextFile(
    compileFiles([
      {
        path: '/pkg/src/index.ts',
        source
      }
    ]),
    'src/index.cc'
  ).code
}

function compileFiles(files: Array<{ path: string; source: string }>): GeneratedTextFile[] {
  const host = createMemoryCompilerHost(files, { root: '/' })

  return compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertRaiiFunctionsUseDirectReturns()
}
