import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { prepareRuntimeArchives } from './helpers/runtime-c.ts'
import {
  assertCcAvailable,
  assertFeatureCompilerAvailable,
  collectFeatureTestFiles,
  type FeatureTestCompiler,
  type FeatureTestFile,
  featureTestSkipReason,
  featureTestName,
  readFeatureTestFile,
  runFeatureTest
} from './helpers/feature-tests.ts'

type FeatureTestStatus = 'passed' | 'failed' | 'skipped'

type FeatureTestResult = {
  name: string
  status: FeatureTestStatus
  message?: string
  reason?: string
}

type WorkerRequest = {
  id: number
  file: string
  compiler: FeatureTestCompiler
}

type WorkerResponse = {
  id: number
  result: FeatureTestResult
}

const workerArg = '--feature-test-worker'
const workerScript = fileURLToPath(import.meta.url)

if (process.argv[2] === workerArg) {
  await runFeatureWorkerProcess()
} else {
  const options = parseRunnerOptions(process.argv.slice(2))

  if (options.compiler.kind !== 'node') {
    await assertCcAvailable()
  }
  await assertFeatureCompilerAvailable(options.compiler)

  const files = await collectFeatureTestFiles(options.paths)
  const parallelism = featureTestParallelism(options.compiler)

  assert.notEqual(files.length, 0, 'feature tests: no .test.ts files found')

  if (options.compiler.kind !== 'node') {
    console.log('precompiling C runtime for feature tests')
    await prepareRuntimeArchives()
  }

  await runFeatureTests(files, parallelism, options.compiler)

  if (shouldRunIntegrationTests(options)) {
    await runIntegrationTests()
  }
}

function featureTestParallelism(compiler: FeatureTestCompiler): number {
  const configured = configuredFeatureTestParallelism()

  if (configured !== null) {
    return configured
  }

  const cpuCount = availableParallelism()

  if (compiler.kind === 'binary') {
    return Math.max(1, Math.ceil(cpuCount / 2))
  }

  return cpuCount
}

function configuredFeatureTestParallelism(): number | null {
  const raw = process.env.INOX_TEST_JOBS

  if (raw === null || typeof raw === 'undefined' || raw === '') {
    return null
  }

  const value = Number(raw)

  assert.ok(Number.isInteger(value) && value > 0, 'INOX_TEST_JOBS must be a positive integer')

  return value
}

function shouldRunIntegrationTests(options: RunnerOptions): boolean {
  return options.compiler.kind === 'hosted' && options.paths.length === 0
}

async function runIntegrationTests(): Promise<void> {
  const { assertBuildCMakeConfigureIsQuiet } = await import('./integration/build-cmake-log-level.test.ts')
  const { assertCliEntryModuleMain } = await import('./integration/cli-entry-module-main.test.ts')
  const { assertCompilerIndexNodeHelp } = await import('./integration/compiler-index-node-help.test.ts')
  const { assertModuleDeclarationImportBoundary } =
    await import('./integration/module-declaration-import-boundary.test.ts')
  const { assertModuleDeclarationContracts } = await import('./integration/module-declaration-contracts.test.ts')
  const { assertModuleDeclarationFunctionKeywordType } =
    await import('./integration/module-declaration-function-keyword-type.test.ts')
  const { assertModuleDeclarationInferredConsts } =
    await import('./integration/module-declaration-inferred-consts.test.ts')
  const { assertModuleDeclarationImports } = await import('./integration/module-declaration-imports.test.ts')
  const { assertModuleDeclarationWeakTypeMarker } =
    await import('./integration/module-declaration-weak-type-marker.test.ts')
  const { assertTestsDoNotReferenceExamples } = await import('./integration/no-example-dependencies.test.ts')
  const { assertNativeInoxDefaultOutput, assertNativeInoxHelp, assertNativeInoxRuntimeSmoke } =
    await import('./integration/native-inox-help.test.ts')
  const { assertNativeInoxModuleGraph } = await import('./integration/native-inox-module-graph.test.ts')
  const { assertNativeInoxProcessRuntimeString } =
    await import('./integration/native-inox-process-runtime-string.test.ts')
  const { assertRuntimeValueCoreDoesNotReferenceFeatureDisposers } =
    await import('./integration/runtime-value-core-dependencies.test.ts')

  await test('compiler integration checks', async (t) => {
    await t.test('no-example-dependencies', async () => {
      await assertTestsDoNotReferenceExamples()
    })

    await t.test('build-cmake-log-level', () => {
      assertBuildCMakeConfigureIsQuiet()
    })

    await t.test('cli-entry-module-main', async () => {
      await assertCliEntryModuleMain()
    })

    await t.test('compiler-index-node-help', async () => {
      await assertCompilerIndexNodeHelp()
    })

    await t.test('module-declaration-contracts', () => {
      assertModuleDeclarationContracts()
    })

    await t.test('module-declaration-function-keyword-type', () => {
      assertModuleDeclarationFunctionKeywordType()
    })

    await t.test('module-declaration-inferred-consts', () => {
      assertModuleDeclarationInferredConsts()
    })

    await t.test('module-declaration-import-boundary', () => {
      assertModuleDeclarationImportBoundary()
    })

    await t.test('module-declaration-imports', () => {
      assertModuleDeclarationImports()
    })

    await t.test('module-declaration-weak-type-marker', () => {
      assertModuleDeclarationWeakTypeMarker()
    })

    await t.test('native-inox-help', async () => {
      await assertNativeInoxHelp()
    })

    await t.test('native-inox-default-output', async () => {
      await assertNativeInoxDefaultOutput()
    })

    await t.test('native-inox-runtime-smoke', async () => {
      await assertNativeInoxRuntimeSmoke()
    })

    await t.test('native-inox-module-graph', async () => {
      await assertNativeInoxModuleGraph()
    })

    await t.test('native-inox-process-runtime-string', async () => {
      await assertNativeInoxProcessRuntimeString()
    })

    await t.test('runtime-value-core-dependencies', async () => {
      await assertRuntimeValueCoreDoesNotReferenceFeatureDisposers()
    })
  })
}

type RunnerOptions = {
  compiler: FeatureTestCompiler
  paths: string[]
}

async function runFeatureTests(files: string[], parallelism: number, compiler: FeatureTestCompiler): Promise<void> {
  await test('compiler feature matrix', { concurrency: parallelism }, async (t) => {
    await Promise.all(
      files.map((file) =>
        t.test(featureTestName(file), async (context) => {
          const result = await runFeatureFileInProcess(file, compiler)

          if (result.status === 'skipped') {
            context.skip(result.reason ?? 'skipped')
            return
          }

          assert.equal(result.status, 'passed', result.message ?? `${result.name}: failed`)
        })
      )
    )
  })
}

async function runFeatureFileInProcess(file: string, compiler: FeatureTestCompiler): Promise<FeatureTestResult> {
  const worker = createFeatureWorker()

  try {
    return await worker.run(file, compiler)
  } finally {
    worker.close()
  }
}

function createFeatureWorker(): {
  run: (file: string, compiler: FeatureTestCompiler) => Promise<FeatureTestResult>
  close: () => void
} {
  const child = fork(workerScript, [workerArg], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  })
  let nextRequestId = 1
  let stdout = ''
  let stderr = ''

  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    stdout = stdout + chunk
  })
  child.stderr?.on('data', (chunk: string) => {
    stderr = stderr + chunk
  })

  return {
    run: (file, compiler) =>
      new Promise<FeatureTestResult>((resolve, reject) => {
        const id = nextRequestId
        nextRequestId = nextRequestId + 1
        const request: WorkerRequest = {
          id,
          file,
          compiler
        }

        const cleanup = (): void => {
          child.off('message', onMessage)
          child.off('error', onError)
          child.off('exit', onExit)
          stdout = ''
          stderr = ''
        }
        const rejectWithOutput = (error: unknown): void => {
          const workerStdout = stdout
          const workerStderr = stderr
          cleanup()
          reject(formatWorkerProcessError(file, error, workerStdout, workerStderr))
        }
        const onMessage = (message: unknown): void => {
          if (!isWorkerResponse(message) || message.id !== id) {
            rejectWithOutput(new Error('feature test worker returned an invalid response'))
            return
          }

          cleanup()
          resolve(message.result)
        }
        const onError = (error: Error): void => {
          rejectWithOutput(error)
        }
        const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
          rejectWithOutput(
            new Error(`feature test worker exited with code ${code ?? 'null'} and signal ${signal ?? 'null'}`)
          )
        }

        child.on('message', onMessage)
        child.once('error', onError)
        child.once('exit', onExit)

        if (!child.send(request)) {
          rejectWithOutput(new Error('feature test worker IPC channel is closed'))
        }
      }),
    close: () => {
      if (child.connected) {
        child.disconnect()
      }
    }
  }
}

async function runFeatureWorkerProcess(): Promise<void> {
  process.on('message', (message: unknown) => {
    void handleFeatureWorkerMessage(message)
  })

  await new Promise<void>((resolve) => {
    process.once('disconnect', resolve)
  })
}

async function handleFeatureWorkerMessage(message: unknown): Promise<void> {
  if (!isWorkerRequest(message)) {
    sendWorkerResponse({
      id: 0,
      result: {
        name: 'feature-worker',
        status: 'failed',
        message: 'feature-worker: failed\ninvalid worker request'
      }
    })
    return
  }

  let result: FeatureTestResult

  try {
    result = await runFeatureFile(message.file, message.compiler)
  } catch (error) {
    result = {
      name: featureTestName(message.file),
      status: 'failed',
      message: formatFeatureFailure(featureTestName(message.file), error)
    }
  }

  sendWorkerResponse({
    id: message.id,
    result
  })
}

function sendWorkerResponse(response: WorkerResponse): void {
  if (process.send) {
    process.send(response)
  }
}

async function runFeatureFile(file: string, compiler: FeatureTestCompiler): Promise<FeatureTestResult> {
  let featureFile: FeatureTestFile

  try {
    featureFile = await readFeatureTestFile(file)
  } catch (error) {
    return {
      name: featureTestName(file),
      status: 'failed',
      message: formatFeatureFailure(featureTestName(file), error)
    }
  }

  if (!featureFile.targets.includes('cc')) {
    return {
      name: featureFile.name,
      status: 'skipped',
      reason: `targets: ${featureFile.targets.join(', ')}`
    }
  }

  const skipReason = featureTestSkipReason(featureFile, compiler)

  if (skipReason) {
    return {
      name: featureFile.name,
      status: 'skipped',
      reason: skipReason
    }
  }

  try {
    await runFeatureTest(featureFile, {
      compiler
    })
    return {
      name: featureFile.name,
      status: 'passed'
    }
  } catch (error) {
    return {
      name: featureFile.name,
      status: 'failed',
      message: formatFeatureFailure(featureFile.name, error)
    }
  }
}

function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (!isRecord(value)) {
    return false
  }

  return typeof value.id === 'number' && typeof value.file === 'string' && isFeatureTestCompiler(value.compiler)
}

function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (!isRecord(value)) {
    return false
  }

  return typeof value.id === 'number' && isFeatureTestResult(value.result)
}

function isFeatureTestResult(value: unknown): value is FeatureTestResult {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.name === 'string' &&
    (value.status === 'passed' || value.status === 'failed' || value.status === 'skipped') &&
    (value.message === undefined || typeof value.message === 'string') &&
    (value.reason === undefined || typeof value.reason === 'string')
  )
}

function isFeatureTestCompiler(value: unknown): value is FeatureTestCompiler {
  if (!isRecord(value)) {
    return false
  }

  if (value.kind === 'hosted') {
    return true
  }

  if (value.kind === 'node') {
    return true
  }

  return value.kind === 'binary' && typeof value.path === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseRunnerOptions(args: string[]): RunnerOptions {
  const paths: string[] = []
  let compiler: FeatureTestCompiler = {
    kind: 'hosted'
  }

  for (let index = 0; index < args.length; index = index + 1) {
    const arg = args[index]

    if (arg === '--') {
      paths.push(...args.slice(index + 1))
      break
    }

    if (arg === '--compiler') {
      const value = args[index + 1]
      index = index + 1

      assert.ok(value && !value.startsWith('-'), '--compiler expects hosted, node or a compiler binary path')
      compiler = parseFeatureTestCompiler(value)
      continue
    }

    if (arg.startsWith('--compiler=')) {
      compiler = parseFeatureTestCompiler(arg.slice('--compiler='.length))
      continue
    }

    paths.push(arg)
  }

  return {
    compiler,
    paths
  }
}

function parseFeatureTestCompiler(value: string): FeatureTestCompiler {
  if (value === 'hosted') {
    return {
      kind: 'hosted'
    }
  }

  if (value === 'node') {
    return {
      kind: 'node'
    }
  }

  return {
    kind: 'binary',
    path: resolve(value)
  }
}

function formatFeatureFailure(name: string, error: unknown): string {
  if (error instanceof Error) {
    return [`${name}: failed`, error.stack ?? error.message].join('\n')
  }

  return [`${name}: failed`, String(error)].join('\n')
}

function formatWorkerProcessError(file: string, error: unknown, stdout: string, stderr: string): Error {
  const details = [formatFeatureFailure(featureTestName(file), error)]

  if (stdout.length > 0) {
    details.push(`worker stdout:\n${stdout}`)
  }

  if (stderr.length > 0) {
    details.push(`worker stderr:\n${stderr}`)
  }

  return new Error(details.join('\n'))
}
