import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeNewlines, runCommand } from './lib/run-command.ts'
import { rootDir } from './lib/repo-checks.ts'

const uvHeaderPath = join(rootDir, 'third_party', 'libuv', 'include', 'uv.h')
const expectedStdout = 'hello cmake score 60\ntext ccjs cmake example 😀 123\ninterval 1\ninterval 2\ninterval 3\n'

try {
  await access(uvHeaderPath)
} catch {
  console.log('Libuv checks skipped: third_party/libuv is not initialized. Run `pnpm run bootstrap:libuv` to enable them.')
  process.exit(0)
}

const cmakeProbe = await runCommand('cmake', ['--version'])

if (cmakeProbe.code !== 0) {
  console.log('Libuv checks skipped: cmake is not available.')
  process.exit(0)
}

const buildDir = await mkdtemp(join(tmpdir(), 'ccjs-libuv-cmake-'))

try {
  await checkCommand('configure libuv example', 'cmake', [
    '-S',
    'example',
    '-B',
    buildDir,
    '-DCCJS_LOOP_BACKEND=libuv'
  ])
  await checkCommand('build libuv example', 'cmake', ['--build', buildDir])

  const run = await runCommand(join(buildDir, 'ccjs_cmake_example'), [])
  const stdout = normalizeNewlines(run.stdout)

  if (run.code !== 0) {
    fail('run libuv example', run)
  } else if (stdout !== expectedStdout) {
    console.error(`Libuv example stdout mismatch.\nExpected: ${JSON.stringify(expectedStdout)}\nActual: ${JSON.stringify(stdout)}`)
    process.exitCode = 1
  } else {
    console.log('Libuv checks passed')
  }
} finally {
  await rm(buildDir, {
    recursive: true,
    force: true
  })
}

async function checkCommand(label: string, command: string, args: string[]): Promise<void> {
  const result = await runCommand(command, args)

  if (result.code !== 0) {
    fail(label, result)
  }
}

function fail(label: string, result: { code: number; stdout: string; stderr: string }): never {
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout)
  }

  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr)
  }

  console.error(`Libuv check failed during ${label} with exit code ${result.code}`)
  process.exit(result.code)
}
