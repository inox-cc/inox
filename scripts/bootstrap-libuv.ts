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

const result = await runCommand('git', ['submodule', 'update', '--init', '--recursive', submodulePath])

if (result.code !== 0) {
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout)
  }

  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr)
  }

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
