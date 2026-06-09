import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { CompileError } from '../src/compiler/diagnostics.ts'
import { compileFile } from '../src/compiler/index.ts'
import type { CompileTarget } from '../src/compiler/types.ts'
import { findFixtureFiles, rootDir } from './lib/repo-checks.ts'
import { parseMetadataList, validateFixtureMetadata } from './lib/fixture-metadata.ts'

type CommandResult = {
  code: number
  stdout: string
  stderr: string
}

const files = await findFixtureFiles()
const failures: string[] = []
const stdoutChecks = {
  passed: 0,
  skipped: 0
}
let cRunnerAvailable: boolean | null = null

for (const file of files) {
  const source = await readFile(file, 'utf8')
  const result = validateFixtureMetadata(source)

  for (const failure of result.failures) {
    failures.push(`${relative(rootDir, file)}: ${failure}`)
  }

  if (result.failures.length === 0) {
    await checkFixtureCompile(file, source, result.metadata)
  }
}

if (failures.length > 0) {
  console.error(['Fixture checks failed', ...failures.map(failure => `- ${failure}`)].join('\n'))
  process.exitCode = 1
} else {
  const stdoutSummary = stdoutChecks.passed + stdoutChecks.skipped === 0
    ? ''
    : `, ${stdoutChecks.passed} stdout check${stdoutChecks.passed === 1 ? '' : 's'}${stdoutChecks.skipped === 0 ? '' : `, ${stdoutChecks.skipped} skipped`}`

  console.log(`Fixture checks passed (${files.length} fixture${files.length === 1 ? '' : 's'}${stdoutSummary})`)
}

async function checkFixtureCompile(file: string, source: string, metadata: Map<string, string>): Promise<void> {
  const rel = relative(rootDir, file)
  const expectation = metadata.get('expect')
  const diagnostic = metadata.get('diagnostic')
  const targets = parseMetadataList(metadata.get('targets') ?? 'js')

  for (const target of targets) {
    try {
      await compileFile(file, {
        target: target as CompileTarget
      })

      if (expectation === 'diagnostic') {
        failures.push(`${rel}: expected diagnostic ${diagnostic} for target ${target}`)
      } else if (expectation === 'pass' && metadata.has('stdout')) {
        await checkFixtureStdout(file, rel, target as CompileTarget, metadata.get('stdout') ?? '')
      }
    } catch (error) {
      if (!(error instanceof CompileError)) {
        failures.push(`${rel}: unexpected error for target ${target}: ${error.message}`)
        continue
      }

      if (expectation === 'pass') {
        failures.push(`${rel}: expected pass for target ${target}, got ${error.diagnostics.map(item => item.code).join(', ')}`)
        continue
      }

      if (expectation === 'diagnostic' && !error.diagnostics.some(item => item.code === diagnostic)) {
        failures.push(`${rel}: expected diagnostic ${diagnostic} for target ${target}, got ${error.diagnostics.map(item => item.code).join(', ')}`)
      }
    }
  }
}

async function checkFixtureStdout(file: string, rel: string, target: CompileTarget, expected: string): Promise<void> {
  if (!(await canRunTarget(target))) {
    stdoutChecks.skipped += 1
    return
  }

  const result = await runCommand(process.execPath, [
    'bin/ccjs.ts',
    'run',
    file,
    '--target',
    target
  ])
  const expectedStdout = expected === '' ? '' : `${expected}\n`
  const stdout = normalizeNewlines(result.stdout)

  if (result.code !== 0) {
    failures.push(`${rel}: expected stdout fixture to exit 0 for target ${target}, got ${result.code}: ${result.stderr.trim()}`)
    return
  }

  if (stdout !== expectedStdout) {
    failures.push(`${rel}: expected stdout ${JSON.stringify(expectedStdout)} for target ${target}, got ${JSON.stringify(stdout)}`)
    return
  }

  stdoutChecks.passed += 1
}

async function canRunTarget(target: CompileTarget): Promise<boolean> {
  if (target !== 'c') {
    return true
  }

  if (cRunnerAvailable == null) {
    try {
      cRunnerAvailable = (await runCommand('cc', ['--version'])).code === 0
    } catch {
      cRunnerAvailable = false
    }
  }

  return cRunnerAvailable
}

function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('exit', code => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      })
    })
  })
}

function normalizeNewlines(value: string): string {
  return value.replaceAll('\r\n', '\n')
}
