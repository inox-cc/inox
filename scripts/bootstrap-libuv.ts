import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { rootDir } from './lib/repo-checks.ts'
import { runCommand } from './lib/run-command.ts'

const submodulePath = 'third_party/libuv'
const uvHeaderPath = join(rootDir, submodulePath, 'include', 'uv.h')

if (await hasUvHeader()) {
  console.log(`Initialized ${submodulePath}`)
  process.exit(0)
}

console.log(`Initializing ${submodulePath}`)

const result = await runCommand(
  'git',
  ['submodule', 'update', '--init', '--recursive', '--depth', '1', '--progress', submodulePath],
  {
    env: {
      GIT_TERMINAL_PROMPT: '0'
    },
    stdout: process.stdout,
    stderr: process.stderr
  }
)

if (result.code !== 0) {
  process.stderr.write(`Failed to initialize ${submodulePath}\n`)
  process.exitCode = result.code
} else {
  if (await hasUvHeader()) {
    console.log(`Initialized ${submodulePath}`)
  } else {
    process.stderr.write(`Initialized ${submodulePath}, but ${uvHeaderPath} was not found\n`)
    process.exitCode = 1
  }
}

async function hasUvHeader(): Promise<boolean> {
  try {
    await access(uvHeaderPath)
    return true
  } catch {
    return false
  }
}
