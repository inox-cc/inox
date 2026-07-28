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

const sourceText = `
import { Buffer } from 'node:buffer'

function check(): void {
  const text = Buffer.from('inox')
  const allocated = Buffer.alloc(2)
  const random = new Uint8Array(4)
  const same = crypto.getRandomValues(random)
  const sliced = text.slice(1)
  const values = ['a', 'b']
  const copied = values.slice(1)
  console.log(text, allocated, same, sliced, copied)
}

check()
`

export function assertNativeResultsInitializeVariablesDirectly(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: sourceText
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assertDirectNativeInitializers(source)
}

export async function assertNativeCompilerUsesDirectNativeInitializers(compilerPath: string): Promise<void> {
  const workspace = join(rootDir, 'dist/test-tmp/direct-native-variable-lowering')
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
    await writeFile(input, sourceText)

    const emit = await runCommand(compilerPath, [input, outputCc])

    assert.equal(
      emit.code,
      0,
      `dist/inox direct native variable emit failed\nstdout:\n${emit.stdout}\nstderr:\n${emit.stderr}`
    )
    assert.equal(emit.stderr, '')

    assertDirectNativeInitializers(await readFile(outputCc, 'utf8'))
  } finally {
    await rm(workspace, {
      recursive: true,
      force: true
    })
  }
}

function assertDirectNativeInitializers(source: string): void {
  assert.match(source, /auto text = Buffer::from\("inox"\);/)
  assert.match(source, /auto allocated = Buffer::alloc\(2(?:\.0)?\);/)
  assert.match(source, /auto inox_random = Uint8Array\(4(?:\.0)?\);/)
  assert.match(source, /auto same = crypto\.getRandomValues\(inox_random\);/)
  assert.doesNotMatch(source, /crypto\.getRandomValues\(Uint8Array\(inox_random\)\)/)
  assert.match(source, /auto sliced = text\.slice\(1(?:\.0)?\);/)
  assert.match(source, /auto copied = values\.slice\(1(?:\.0)?\);/)
  assert.doesNotMatch(
    source,
    /auto inox_library_result_\d+ = (?:Buffer::from|Buffer::alloc|Uint8Array|crypto\.getRandomValues|text\.slice|values\.slice)/
  )
  assert.doesNotMatch(source, /auto (?:text|allocated|inox_random|same|sliced|copied) = inox_library_result_\d+;/)
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
  assertNativeResultsInitializeVariablesDirectly()
}
