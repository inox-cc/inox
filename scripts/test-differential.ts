import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { CompileTarget } from '../src/compiler/types.ts'
import { rootDir } from './lib/repo-checks.ts'
import { normalizeNewlines, runCommand, type CommandResult } from './lib/run-command.ts'

type RunnableTarget = Extract<CompileTarget, 'ts' | 'c'>

const fixtureRoot = join(rootDir, 'tests/differential')
const files = await findDifferentialFiles(fixtureRoot)
const failures: string[] = []
const cAvailable = await canRunC()

if (files.length === 0) {
  console.error('Differential checks failed\n- missing differential fixtures under tests/differential')
  process.exitCode = 1
} else if (!cAvailable) {
  console.log(`Differential checks skipped (${files.length} fixture${files.length === 1 ? '' : 's'}, cc unavailable)`)
} else {
  for (const file of files) {
    await checkDifferentialFixture(file)
  }

  if (failures.length > 0) {
    console.error(['Differential checks failed', ...failures.map(failure => `- ${failure}`)].join('\n'))
    process.exitCode = 1
  } else {
    console.log(`Differential checks passed (${files.length} fixture${files.length === 1 ? '' : 's'})`)
  }
}

async function checkDifferentialFixture(file: string): Promise<void> {
  const rel = relative(rootDir, file)
  const ts = await runFixture(file, 'ts')
  const c = await runFixture(file, 'c')

  if (!checkSuccessful(rel, 'ts', ts) || !checkSuccessful(rel, 'c', c)) {
    return
  }

  const tsStdout = normalizeNewlines(ts.stdout)
  const cStdout = normalizeNewlines(c.stdout)
  const tsStderr = normalizeNewlines(ts.stderr)
  const cStderr = normalizeNewlines(c.stderr)

  if (tsStdout !== cStdout) {
    failures.push(`${rel}: stdout mismatch between ts ${JSON.stringify(tsStdout)} and c ${JSON.stringify(cStdout)}`)
  }

  if (tsStderr !== cStderr) {
    failures.push(`${rel}: stderr mismatch between ts ${JSON.stringify(tsStderr)} and c ${JSON.stringify(cStderr)}`)
  }
}

function checkSuccessful(rel: string, target: RunnableTarget, result: CommandResult): boolean {
  if (result.code === 0) {
    return true
  }

  failures.push(`${rel}: expected ${target} run to exit 0, got ${result.code}: ${result.stderr.trim()}`)
  return false
}

function runFixture(file: string, target: RunnableTarget): Promise<CommandResult> {
  return runCommand(process.execPath, [
    'bin/ccjs.ts',
    'run',
    file,
    '--target',
    target
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
