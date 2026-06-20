import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { rootDir } from './lib/repo-root.ts'
import { runCommand } from './lib/run-command.ts'

const submodulePath = 'third_party/boringssl'
const sslHeaderPath = join(rootDir, submodulePath, 'include', 'openssl', 'ssl.h')

if (await hasSslHeader()) {
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
  if (await hasSslHeader()) {
    console.log(`Initialized ${submodulePath}`)
  } else {
    process.stderr.write(`Initialized ${submodulePath}, but ${sslHeaderPath} was not found\n`)
    process.exitCode = 1
  }
}

async function hasSslHeader(): Promise<boolean> {
  try {
    await access(sslHeaderPath)
    return true
  } catch {
    return false
  }
}
