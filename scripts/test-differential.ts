import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { rootDir } from './lib/repo-checks.ts'
import { runCommand, type CommandResult } from './lib/run-command.ts'

const fixtureRoot = join(rootDir, 'tests/differential')
const files = await findDifferentialFiles(fixtureRoot)
const failures: string[] = []
const cAvailable = await canRunC()

if (files.length === 0) {
  console.error('C fixture smoke checks failed\n- missing fixtures under tests/differential')
  process.exitCode = 1
} else if (!cAvailable) {
  console.log(`C fixture smoke checks skipped (${files.length} fixture${files.length === 1 ? '' : 's'}, cc unavailable)`)
} else {
  for (const file of files) {
    await checkSmokeFixture(file)
  }

  if (failures.length > 0) {
    console.error(['C fixture smoke checks failed', ...failures.map(failure => `- ${failure}`)].join('\n'))
    process.exitCode = 1
  } else {
    console.log(`C fixture smoke checks passed (${files.length} fixture${files.length === 1 ? '' : 's'})`)
  }
}

async function checkSmokeFixture(file: string): Promise<void> {
  const rel = relative(rootDir, file)
  const c = await runFixture(file)

  if (!checkSuccessful(rel, c)) {
    return
  }
}

function checkSuccessful(rel: string, result: CommandResult): boolean {
  if (result.code === 0) {
    return true
  }

  failures.push(`${rel}: expected c run to exit 0, got ${result.code}: ${result.stderr.trim()}`)
  return false
}

function runFixture(file: string): Promise<CommandResult> {
  return runCommand(process.execPath, [
    'bin/ccjs.ts',
    'run',
    file
  ])
}

async function canRunC(): Promise<boolean> {
  try {
    return (await runCommand('cc', ['--version'])).code === 0
  } catch {
    return false
  }
}

async function findDifferentialFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, {
    withFileTypes: true
  })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...await findDifferentialFiles(path))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path)
    }
  }

  return files.sort()
}
