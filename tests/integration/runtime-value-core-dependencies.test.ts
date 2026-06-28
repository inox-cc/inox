import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

type CommandResult = {
  code: number
  stdout: string
  stderr: string
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export async function assertRuntimeValueCoreDoesNotReferenceFeatureDisposers(): Promise<void> {
  const dir = await createTestTempDir()
  const objectPath = join(dir, 'value.o')

  try {
    const compile = await runCommand('cc', [
      '-Iruntime/include',
      '-Istdlib/global/strings/include',
      '-c',
      'runtime/src/core/value.c',
      '-o',
      objectPath
    ])

    assert.equal(
      compile.code,
      0,
      `runtime value.c compile failed\nstdout: ${compile.stdout}\nstderr: ${compile.stderr}`
    )

    const symbols = await runCommand('nm', ['-u', objectPath])

    assert.equal(symbols.code, 0, `nm failed\nstdout: ${symbols.stdout}\nstderr: ${symbols.stderr}`)
    assertNoUndefinedSymbol(symbols.stdout, 'inox_array')
    assertNoUndefinedSymbol(symbols.stdout, 'inox_callback')
    assertNoUndefinedSymbol(symbols.stdout, 'inox_map')
    assertNoUndefinedSymbol(symbols.stdout, 'inox_object')
    assertNoUndefinedSymbol(symbols.stdout, 'inox_set')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function assertNoUndefinedSymbol(output: string, namePrefix: string): void {
  assert.ok(!output.includes(namePrefix), `runtime value.c should not reference ${namePrefix} symbols\n${output}`)
}

async function createTestTempDir(): Promise<string> {
  const root = join(repoRoot, 'dist/test-tmp')

  await mkdir(root, {
    recursive: true
  })

  return await mkdtemp(join(root, 'inox-runtime-value-core-'))
}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let spawnError: Error | null = null

    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    child.on('error', (error) => {
      spawnError = error
    })
    child.on('close', (code) => {
      resolve({
        code: spawnError ? 127 : (code ?? 1),
        stdout,
        stderr: spawnError ? `${stderr}${spawnError.message}` : stderr
      })
    })
  })
}
