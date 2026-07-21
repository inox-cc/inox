import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { runCompilerCli, type CliEnvironment } from '../../compiler/cli.ts'
import { emptyCompilerLibrarySet } from '../../compiler/extensions/library-set.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('CLI получает aliases и значения options только из выбранных libraries', async () => {
  const workspace = 'dist/test-tmp/compiler-library-option-cli'
  const input = `${workspace}/index.ts`

  await rm(workspace, { force: true, recursive: true })
  await mkdir(workspace, { recursive: true })
  await writeFile(input, 'console.log(Math.random())\n')

  try {
    const selected = runCli(defaultCompilerLibrarySet, [
      input,
      '--random-backend',
      'xorshift32',
      '--random-seed',
      '7'
    ])

    assert.equal(selected.exitCode, 0)
    assert.equal(selected.errors.length, 0)
    assert.match(
      selected.output,
      /MathObject Math\(0x00000007u, true, MathRandomBackend::Xorshift32\);/
    )

    const missing = runCli(emptyCompilerLibrarySet, [input, '--random-seed', '7'])

    assert.equal(missing.exitCode, 1)
    assert.equal(missing.errors[0], 'unknown option --random-seed')

    const selectedPlatform = runCli(defaultCompilerLibrarySet, [input, '--loop-backend', 'libuv'])

    assert.equal(selectedPlatform.exitCode, 0)

    const missingPlatform = runCli(emptyCompilerLibrarySet, [input, '--loop-backend', 'libuv'])

    assert.equal(missingPlatform.exitCode, 1)
    assert.equal(missingPlatform.errors[0], 'unknown option --loop-backend')

    const help = runCli(defaultCompilerLibrarySet, ['--help'])

    assert.match(help.logs[0], /--random-backend/)
    assert.match(help.logs[0], /--random-seed/)
    assert.match(help.logs[0], /--loop-backend/)
    assert.match(help.logs[0], /--tls-backend/)
  } finally {
    await rm(workspace, { force: true, recursive: true })
  }
})

function runCli(
  libraries: Parameters<typeof runCompilerCli>[0],
  args: string[]
): { errors: string[]; exitCode: number; logs: string[]; output: string } {
  const errors: string[] = []
  const logs: string[] = []
  let exitCode = 0
  let output = ''
  const environment: CliEnvironment = {
    args: ['node', 'inox', ...args],
    cwd: '.',
    error(message) {
      errors.push(message)
    },
    log(message) {
      logs.push(message)
    },
    mkdirSync() {},
    setExitCode(code) {
      exitCode = code
    },
    writeFileSync(_path, source) {
      output = source
    }
  }

  runCompilerCli(libraries, environment)
  return { errors, exitCode, logs, output }
}
