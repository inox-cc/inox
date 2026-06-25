import assert, { equal, fail, ok } from 'node:assert/strict'
import { constants } from 'node:fs'
import { access, readdir, stat } from 'node:fs/promises'
import path, { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CompileError, formatDiagnostics } from '../../compiler/diagnostics.ts'
import { compileFile } from '../../compiler/compiler.ts'
import {
  compileRuntimeProgram,
  compileSource,
  createTestTempDir,
  readFile,
  rm,
  runCommand,
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

export type FeatureTestCompiler =
  | {
      kind: 'hosted'
    }
  | {
      kind: 'node'
    }
  | {
      kind: 'binary'
      path: string
    }

export type FeatureTestOptions = {
  compiler?: FeatureTestCompiler
}

export type FeatureTestFile = {
  path: string
  name: string
  source: string
  targets: string[]
  expectation: FeatureExpectation
  expectedStdout: string
  expectedStderr: string
  nodeSkipReason?: string
  usesModuleGraph: boolean
}

const featureRoot = fileURLToPath(new URL('../features/', import.meta.url))
const defaultFeatureTestCompiler: FeatureTestCompiler = {
  kind: 'hosted'
}

export async function collectFeatureTestFiles(args: string[]): Promise<string[]> {
  const requestedArgs = args.filter((arg) => arg !== '--')
  const requests = requestedArgs.length > 0 ? requestedArgs : [featureRoot]
  const files: string[] = []

  for (const request of requests) {
    files.push(...(await collectFeatureTestRequest(request)))
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

export async function assertFeatureCompilerAvailable(compiler: FeatureTestCompiler): Promise<void> {
  if (compiler.kind === 'hosted' || compiler.kind === 'node') {
    return
  }

  try {
    await access(compiler.path, constants.X_OK)
  } catch {
    assert.fail(`feature compiler is not executable: ${compiler.path}\nRun pnpm run build first.`)
  }
}

export async function runFeatureTest(featureFile: FeatureTestFile, options: FeatureTestOptions = {}): Promise<void> {
  const compiler = options.compiler ?? defaultFeatureTestCompiler

  if (compiler.kind === 'node') {
    await assertRunsWithNode(featureFile)
    return
  }

  if (featureFile.expectation.kind === 'diagnostics') {
    await assertExpectedDiagnostics(featureFile, compiler)
  } else {
    await assertCompilesAndRuns(featureFile, compiler)
  }
}

export function featureTestSkipReason(featureFile: FeatureTestFile, compiler: FeatureTestCompiler): string | undefined {
  if (compiler.kind !== 'node') {
    return undefined
  }

  if (featureFile.nodeSkipReason) {
    return featureFile.nodeSkipReason
  }

  if (isInoxFeaturePath(featureFile.path)) {
    return 'node: inox-only feature case'
  }

  if (featureFile.expectation.kind === 'diagnostics') {
    return 'node: compiler diagnostics are not checked'
  }

  if (usesExtensionlessRelativeModuleImport(featureFile.source)) {
    return 'node: case requires compiler module resolution'
  }

  return undefined
}

export function featureTestName(path: string): string {
  return basename(path, extname(path)).replace(/\.test$/, '')
}

async function collectFeatureTestRequest(request: string): Promise<string[]> {
  const directPath = await collectExistingPath(request)

  if (directPath) {
    return directPath
  }

  if (!request.endsWith('.test.ts')) {
    const testFilePath = await collectExistingPath(`${request}.test.ts`)

    if (testFilePath) {
      return testFilePath
    }
  }

  if (!isBareTestName(request)) {
    assert.fail(`feature tests: path not found: ${resolve(request)}`)
  }

  return await collectFeatureTestName(request)
}

async function collectExistingPath(path: string): Promise<string[] | undefined> {
  try {
    return await collectPath(resolve(path))
  } catch (error) {
    if (isMissingPathError(error)) {
      return undefined
    }

    throw error
  }
}

async function collectFeatureTestName(name: string): Promise<string[]> {
  const normalizedName = normalizeFeatureTestName(name)
  const matches = (await collectPath(featureRoot)).filter((file) => featureTestName(file) === normalizedName)

  assert.ok(matches.length > 0, `feature tests: no test named ${name}`)

  return matches
}

function normalizeFeatureTestName(name: string): string {
  const fileName = basename(name)

  if (fileName.endsWith('.test.ts')) {
    return fileName.slice(0, -'.test.ts'.length)
  }

  if (fileName.endsWith('.ts')) {
    return fileName.slice(0, -'.ts'.length)
  }

  return fileName
}

function isBareTestName(value: string): boolean {
  return !value.includes('/') && !value.includes('\\')
}

function isMissingPathError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false
  }

  return error.code === 'ENOENT'
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
  let nodeSkipReason: string | undefined
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
    } else if (key === 'skip-node') {
      nodeSkipReason = value.length > 0 ? value : 'node: skipped by test directive'
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
    nodeSkipReason,
    usesModuleGraph: usesRelativeModuleImport(source)
  }
}

function isInoxFeaturePath(path: string): boolean {
  const normalizedFeatureRoot = removeTrailingSlash(normalizeFilePath(featureRoot))
  const normalizedPath = normalizeFilePath(path)

  return normalizedPath.startsWith(`${normalizedFeatureRoot}/inox/`)
}

function normalizeFilePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function removeTrailingSlash(path: string): string {
  if (path.endsWith('/')) {
    return path.slice(0, -1)
  }

  return path
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

async function assertCompilesAndRuns(featureFile: FeatureTestFile, compiler: FeatureTestCompiler): Promise<void> {
  const dir = await createTestTempDir('inox-feature-')
  const emittedCPath = join(dir, `${sanitizePath(featureFile.name)}.c`)
  const exePath = join(dir, sanitizePath(featureFile.name))
  let keepArtifacts = false

  try {
    let emittedC: string

    try {
      emittedC = await compileFeatureTestToC(featureFile, compiler)
    } catch (error) {
      assert.fail(`${featureFile.name}: ${featureCompilerStage(compiler)} failed\n${formatCompileError(error)}`)
    }

    await writeFile(emittedCPath, emittedC)

    const compile = await compileRuntimeProgram(emittedCPath, exePath, featureRuntimeCompileArgs(emittedC))
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

async function assertRunsWithNode(featureFile: FeatureTestFile): Promise<void> {
  if (featureFile.expectation.kind === 'diagnostics') {
    assert.fail(`${featureFile.name}: node mode cannot check compiler diagnostics`)
  }

  const run = await runCommand('node', [featureFile.path])

  assert.equal(run.code, 0, `${featureFile.name}: node-run failed\nstdout: ${run.stdout}\nstderr: ${run.stderr}`)
  assert.ok(
    nodeStdoutMatches(featureFile.expectedStdout, run.stdout),
    `${featureFile.name}: stdout mismatch\nactual: ${run.stdout}\nexpected: ${featureFile.expectedStdout}`
  )
  assert.equal(run.stderr, featureFile.expectedStderr, `${featureFile.name}: stderr mismatch`)
}

function nodeStdoutMatches(expected: string, actual: string): boolean {
  if (actual === expected) {
    return true
  }

  const expectedLines = expected.split('\n')
  const actualLines = actual.split('\n')

  if (expectedLines.length !== actualLines.length) {
    return false
  }

  for (let index = 0; index < expectedLines.length; index = index + 1) {
    const expectedLine = expectedLines[index]
    const actualLine = actualLines[index]

    if (actualLine === expectedLine) {
      continue
    }

    if (isNodeBooleanStdoutAlias(expectedLine, actualLine)) {
      continue
    }

    if (isNodeConsoleArrayStdoutAlias(expectedLine, actualLine)) {
      continue
    }

    return false
  }

  return true
}

function isNodeBooleanStdoutAlias(expected: string, actual: string): boolean {
  return (expected === '1' && actual === 'true') || (expected === '0' && actual === 'false')
}

function isNodeConsoleArrayStdoutAlias(expected: string, actual: string): boolean {
  if (!expected.startsWith('[')) {
    return false
  }

  return normalizeNodeConsoleArrayLine(actual) === expected
}

function normalizeNodeConsoleArrayLine(line: string): string {
  return line
    .replace(/'([^'\\]*)'/g, '$1')
    .replace(/\[\s+/g, '[')
    .replace(/\s+\]/g, ']')
}

function featureRuntimeCompileArgs(emittedC: string): string[] {
  const args: string[] = []

  if (emittedC.includes('INOX_FIELD_WEAK')) {
    args.push('-DINOX_ENABLE_WEAK=1')
  }

  return args
}

async function assertExpectedDiagnostics(featureFile: FeatureTestFile, compiler: FeatureTestCompiler): Promise<void> {
  if (featureFile.expectation.kind !== 'diagnostics') {
    assert.fail(`${featureFile.name}: expected a diagnostics feature test`)
  }

  const expectedCodes = featureFile.expectation.codes

  try {
    await compileFeatureTestToC(featureFile, compiler)
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

    if (error instanceof FeatureBinaryCompilerError) {
      const output = `${error.stdout}\n${error.stderr}\n${error.message}`

      for (const expectedCode of expectedCodes) {
        assert.ok(
          output.includes(expectedCode),
          `${featureFile.name}: missing diagnostic ${expectedCode}\n${formatCompileError(error)}`
        )
      }

      return
    }

    throw error
  }

  assert.fail(`${featureFile.name}: expected diagnostics ${expectedCodes.join(', ')}, but emitted C`)
}

async function compileFeatureTestToC(featureFile: FeatureTestFile, compiler: FeatureTestCompiler): Promise<string> {
  if (compiler.kind === 'binary') {
    return await compileFeatureTestWithBinary(featureFile, compiler)
  }

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

async function compileFeatureTestWithBinary(
  featureFile: FeatureTestFile,
  compiler: Extract<FeatureTestCompiler, { kind: 'binary' }>
): Promise<string> {
  const dir = await createTestTempDir('inox-feature-compiler-')
  const outputPath = join(dir, `${sanitizePath(featureFile.name)}.c`)

  try {
    const compile = await runCommand(compiler.path, [featureFile.path, outputPath])

    if (compile.code !== 0) {
      throw new FeatureBinaryCompilerError(featureFile.name, compiler.path, featureFile.path, outputPath, compile)
    }

    return await readFile(outputPath, 'utf8')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function formatCompileError(error: unknown): string {
  if (error instanceof CompileError) {
    return formatDiagnostics(error.diagnostics)
  }

  if (error instanceof FeatureBinaryCompilerError) {
    return error.message
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

function featureCompilerStage(compiler: FeatureTestCompiler): string {
  if (compiler.kind === 'hosted') {
    return 'hosted-compile'
  }

  if (compiler.kind === 'node') {
    return 'node-run'
  }

  return `binary-compile (${compiler.path})`
}

function usesExtensionlessRelativeModuleImport(source: string): boolean {
  const moduleSpecifierPattern = /(?:^|\n)\s*(?:import|export)\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g
  let match = moduleSpecifierPattern.exec(source)

  while (match) {
    const specifier = match[1]

    if ((specifier.startsWith('./') || specifier.startsWith('../')) && extname(specifier) === '') {
      return true
    }

    match = moduleSpecifierPattern.exec(source)
  }

  return false
}

class FeatureBinaryCompilerError extends Error {
  readonly stdout: string
  readonly stderr: string

  constructor(
    name: string,
    compilerPath: string,
    inputPath: string,
    outputPath: string,
    result: { code: number; stdout: string; stderr: string }
  ) {
    super(
      [
        `${name}: binary compiler failed`,
        `compiler: ${compilerPath}`,
        `input: ${inputPath}`,
        `output: ${outputPath}`,
        `exit code: ${result.code}`,
        `stdout: ${result.stdout}`,
        `stderr: ${result.stderr}`
      ].join('\n')
    )
    this.name = 'FeatureBinaryCompilerError'
    this.stdout = result.stdout
    this.stderr = result.stderr
  }
}
