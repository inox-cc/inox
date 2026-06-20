import assert from 'node:assert/strict'
import { readdir, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CompileError, formatDiagnostics } from '../../compiler/diagnostics.ts'
import { compileFile } from '../../compiler/index.ts'
import {
  compileRuntimeProgram,
  compileSource,
  mkdtemp,
  readFile,
  rm,
  runCommand,
  tmpdir,
  writeFile
} from './runtime-c.ts'

type FeatureExpectation =
  | {
      kind: 'pass'
    }
  | {
      kind: 'diagnostics'
      codes: string[]
    }

export type FeatureTestFile = {
  path: string
  name: string
  source: string
  targets: string[]
  expectation: FeatureExpectation
  expectedStdout: string
  expectedStderr: string
  usesModuleGraph: boolean
}

const featureRoot = fileURLToPath(new URL('../features/', import.meta.url))

export async function collectFeatureTestFiles(args: string[]): Promise<string[]> {
  const requestedRoots = args.filter((arg) => arg !== '--')
  const roots = requestedRoots.length > 0 ? requestedRoots.map((arg) => resolve(arg)) : [featureRoot]
  const files: string[] = []

  for (const root of roots) {
    files.push(...(await collectPath(root)))
  }

  return [...new Set(files)].sort()
}

export async function readFeatureTestFile(path: string): Promise<FeatureTestFile> {
  const raw = await readFile(path, 'utf8')

  return parseFeatureTestFile(path, raw)
}

export async function assertCcAvailable(): Promise<void> {
  const cc = await runCommand('cc', ['--version'])

  assert.equal(cc.code, 0, 'cc is not available')
}

export async function runFeatureTest(featureFile: FeatureTestFile): Promise<void> {
  if (featureFile.expectation.kind === 'diagnostics') {
    await assertExpectedDiagnostics(featureFile)
  } else {
    await assertCompilesAndRuns(featureFile)
  }
}

export function featureTestName(path: string): string {
  return basename(path, extname(path)).replace(/\.test$/, '')
}

async function collectPath(path: string): Promise<string[]> {
  const info = await stat(path)

  if (info.isDirectory()) {
    const entries = await readdir(path, {
      withFileTypes: true
    })
    const files: string[] = []

    for (const entry of entries) {
      files.push(...(await collectPath(join(path, entry.name))))
    }

    return files
  }

  if (info.isFile() && path.endsWith('.test.ts')) {
    return [path]
  }

  return []
}

function parseFeatureTestFile(path: string, raw: string): FeatureTestFile {
  const lines = raw.split('\n')
  const targets: string[] = []
  const stdout: string[] = []
  const stderr: string[] = []
  let expectation: FeatureExpectation | undefined
  let sourceStart = lines.length

  for (let index = 0; index < lines.length; index = index + 1) {
    const line = lines[index]
    const match = /^\/\/ @([a-z-]+)(?: (.*))?$/.exec(line)

    if (!match) {
      sourceStart = line.trim() === '' ? index + 1 : index
      break
    }

    const key = match[1]
    const value = match[2] ?? ''

    if (key === 'targets') {
      targets.push(...words(value))
    } else if (key === 'expect') {
      expectation = parseExpectation(value)
    } else if (key === 'stdout') {
      stdout.push(value)
    } else if (key === 'stderr') {
      stderr.push(value)
    } else {
      assert.fail(`${featureTestName(path)}: unknown directive @${key}`)
    }
  }

  assert.ok(targets.length > 0, `${featureTestName(path)}: missing @targets directive`)
  assert.ok(expectation, `${featureTestName(path)}: missing @expect directive`)

  const source = lines.slice(sourceStart).join('\n')

  return {
    path,
    name: featureTestName(path),
    source,
    targets,
    expectation,
    expectedStdout: expectedText(stdout),
    expectedStderr: expectedText(stderr),
    usesModuleGraph: usesRelativeModuleImport(source)
  }
}

function parseExpectation(value: string): FeatureExpectation {
  const parts = words(value)
  const kind = parts[0]

  if (kind === 'pass') {
    return {
      kind
    }
  }

  if (kind === 'diagnostics') {
    const codes = parts.slice(1)

    assert.ok(codes.length > 0, '@expect diagnostics requires at least one diagnostic code')

    return {
      kind,
      codes
    }
  }

  assert.fail(`unknown @expect value: ${value}`)
}

async function assertCompilesAndRuns(featureFile: FeatureTestFile): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'inox-feature-'))
  const emittedCPath = join(dir, `${sanitizePath(featureFile.name)}.c`)
  const exePath = join(dir, sanitizePath(featureFile.name))
  let keepArtifacts = false

  try {
    let emittedC: string

    try {
      emittedC = await compileFeatureTestToC(featureFile)
    } catch (error) {
      assert.fail(`${featureFile.name}: node-compile failed\n${formatCompileError(error)}`)
    }

    await writeFile(emittedCPath, emittedC)

    const compile = await compileRuntimeProgram(emittedCPath, exePath)
    keepArtifacts = compile.code !== 0

    assert.equal(
      compile.code,
      0,
      `${featureFile.name}: emitted-c-compile failed\nemitted C: ${emittedCPath}\nstdout: ${compile.stdout}\nstderr: ${compile.stderr}`
    )

    const run = await runCommand(exePath, [])
    keepArtifacts = run.code !== 0

    assert.equal(
      run.code,
      0,
      `${featureFile.name}: emitted-binary-run failed\nemitted C: ${emittedCPath}\nstdout: ${run.stdout}\nstderr: ${run.stderr}`
    )
    assert.equal(
      run.stdout,
      featureFile.expectedStdout,
      `${featureFile.name}: stdout mismatch\nemitted C: ${emittedCPath}`
    )
    assert.equal(
      run.stderr,
      featureFile.expectedStderr,
      `${featureFile.name}: stderr mismatch\nemitted C: ${emittedCPath}`
    )
  } catch (error) {
    keepArtifacts = true
    throw error
  } finally {
    if (!keepArtifacts) {
      await rm(dir, { recursive: true, force: true })
    }
  }
}

async function assertExpectedDiagnostics(featureFile: FeatureTestFile): Promise<void> {
  if (featureFile.expectation.kind !== 'diagnostics') {
    assert.fail(`${featureFile.name}: expected a diagnostics feature test`)
  }

  const expectedCodes = featureFile.expectation.codes

  try {
    await compileFeatureTestToC(featureFile)
  } catch (error) {
    if (error instanceof CompileError) {
      const actualCodes = error.diagnostics.map((diagnostic) => diagnostic.code)

      for (const expectedCode of expectedCodes) {
        assert.ok(
          actualCodes.includes(expectedCode),
          `${featureFile.name}: missing diagnostic ${expectedCode}\n${formatDiagnostics(error.diagnostics)}`
        )
      }

      return
    }

    throw error
  }

  assert.fail(`${featureFile.name}: expected diagnostics ${expectedCodes.join(', ')}, but emitted C`)
}

async function compileFeatureTestToC(featureFile: FeatureTestFile): Promise<string> {
  if (featureFile.usesModuleGraph) {
    const result = await compileFile(featureFile.path, {
      target: 'c'
    })

    return result.code
  }

  const result = compileSource(featureFile.source, {
    target: 'c'
  })

  return result.code
}

function formatCompileError(error: unknown): string {
  if (error instanceof CompileError) {
    return formatDiagnostics(error.diagnostics)
  }

  if (error instanceof Error) {
    return error.stack ?? error.message
  }

  return String(error)
}

function expectedText(lines: string[]): string {
  if (lines.length === 0) {
    return ''
  }

  return `${lines.join('\n')}\n`
}

function sanitizePath(path: string): string {
  return path.replace(/[^a-zA-Z0-9_.-]/g, '-')
}

function words(value: string): string[] {
  return value.split(/\s+/).filter((word) => word.length > 0)
}

function usesRelativeModuleImport(source: string): boolean {
  return /(?:^|\n)\s*(?:import|export)\s+(?:[^'"]+\s+from\s+)?['"](?:\.\/|\.\.\/)/.test(source)
}
