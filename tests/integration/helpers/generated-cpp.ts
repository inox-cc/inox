import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { compileFileToCppModuleTextsSync } from '../../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../../compiler/memory-host.ts'
import { rootDir } from '../../../scripts/lib/repo-root.ts'
import { runCommand } from '../../../scripts/lib/run-command.ts'
import { defaultCompilerLibrarySet } from '../../helpers/compiler-libraries.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function compileHostedCpp(source: string): string {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source
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

  for (const file of files) {
    if (file.path === 'src/index.cc') {
      return file.code
    }
  }

  throw new Error('missing generated file src/index.cc')
}

export async function compileNativeCpp(compilerPath: string, testName: string, source: string): Promise<string> {
  const workspace = join(rootDir, 'dist/test-tmp', testName)
  const input = join(workspace, 'index.ts')
  const output = join(workspace, 'index.cc')

  try {
    await rm(workspace, {
      recursive: true,
      force: true
    })
    await mkdir(workspace, {
      recursive: true
    })
    await writeFile(input, source)

    const emit = await runCommand(compilerPath, [input, output])

    if (emit.code !== 0 || emit.stderr !== '') {
      throw new Error(
        `${testName} native emit failed\nexit code: ${emit.code}\nstdout:\n${emit.stdout}\nstderr:\n${emit.stderr}`
      )
    }

    return await readFile(output, 'utf8')
  } finally {
    await rm(workspace, {
      recursive: true,
      force: true
    })
  }
}
