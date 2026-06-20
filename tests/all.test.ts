import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

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
  const parallelism = availableParallelism() * 4

  assert.notEqual(files.length, 0, 'feature tests: no .test.ts files found')

  if (process.env.INOX_FEATURE_TEST_REPORT === 'verbose') {
    await runVerboseFeatureTests(files, parallelism, options.compiler)
  } else {
    await runBriefFeatureTests(files, parallelism, options.compiler)
  }
}

type RunnerOptions = {
  compiler: FeatureTestCompiler
  paths: string[]
}

async function runVerboseFeatureTests(
  files: string[],
  parallelism: number,
  compiler: FeatureTestCompiler
): Promise<void> {
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

async function runBriefFeatureTests(
  files: string[],
  parallelism: number,
  compiler: FeatureTestCompiler
): Promise<void> {
  const results = await runFeatureFilesInWorkerPool(files, parallelism, compiler)
  const passed = results.filter((result) => result.status === 'passed').length
  const failed = results.filter((result) => result.status === 'failed').length
  const skipped = results.filter((result) => result.status === 'skipped').length

  for (const result of results) {
    if (result.status === 'failed') {
      console.error(result.message ?? `${result.name}: failed`)
    }
  }

  console.log(`passed: ${passed}`)
  console.log(`failed: ${failed}`)
  console.log(`skipped: ${skipped}`)
  console.log(`total: ${files.length}`)

  if (failed > 0) {
    process.exitCode = 1
  }
}

async function runFeatureFilesInWorkerPool(
  files: string[],
  parallelism: number,
  compiler: FeatureTestCompiler
): Promise<FeatureTestResult[]> {
  const workerCount = Math.max(1, Math.min(parallelism, files.length))
  const results: FeatureTestResult[] = []
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      const worker = createFeatureWorker()

      try {
        while (nextIndex < files.length) {
          const index = nextIndex
          nextIndex = nextIndex + 1

          try {
            results[index] = await worker.run(files[index], compiler)
          } catch (error) {
            results[index] = {
              name: featureTestName(files[index]),
              status: 'failed',
              message: formatBriefFailure(featureTestName(files[index]), error)
            }
          }
        }
      } finally {
        worker.close()
      }
    })
  )

  return results
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
      message: formatBriefFailure(featureTestName(message.file), error)
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
      message: formatBriefFailure(featureTestName(file), error)
    }
  }

  if (!featureFile.targets.includes('c')) {
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
      message: formatBriefFailure(featureFile.name, error)
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

function formatBriefFailure(name: string, error: unknown): string {
  if (error instanceof Error) {
    return [`${name}: failed`, error.stack ?? error.message].join('\n')
  }

  return [`${name}: failed`, String(error)].join('\n')
}

function formatWorkerProcessError(file: string, error: unknown, stdout: string, stderr: string): Error {
  const details = [formatBriefFailure(featureTestName(file), error)]

  if (stdout.length > 0) {
    details.push(`worker stdout:\n${stdout}`)
  }

  if (stderr.length > 0) {
    details.push(`worker stderr:\n${stderr}`)
  }

  return new Error(details.join('\n'))
}
