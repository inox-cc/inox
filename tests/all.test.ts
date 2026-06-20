import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  assertCcAvailable,
  collectFeatureTestFiles,
  type FeatureTestFile,
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
  await assertCcAvailable()

  const files = await collectFeatureTestFiles(process.argv.slice(2))
  const parallelism = availableParallelism() * 4

  assert.notEqual(files.length, 0, 'feature tests: no .test.ts files found')

  if (process.env.INOX_FEATURE_TEST_REPORT === 'verbose') {
    await runVerboseFeatureTests(files, parallelism)
  } else {
    await runBriefFeatureTests(files, parallelism)
  }
}

async function runVerboseFeatureTests(files: string[], parallelism: number): Promise<void> {
  await test('compiler feature matrix', { concurrency: parallelism }, async (t) => {
    await Promise.all(
      files.map((file) =>
        t.test(featureTestName(file), async (context) => {
          const result = await runFeatureFileInProcess(file)

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

async function runBriefFeatureTests(files: string[], parallelism: number): Promise<void> {
  const results = await runFeatureFilesInWorkerPool(files, parallelism)
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

async function runFeatureFilesInWorkerPool(files: string[], parallelism: number): Promise<FeatureTestResult[]> {
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
            results[index] = await worker.run(files[index])
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

async function runFeatureFileInProcess(file: string): Promise<FeatureTestResult> {
  const worker = createFeatureWorker()

  try {
    return await worker.run(file)
  } finally {
    worker.close()
  }
}

function createFeatureWorker(): {
  run: (file: string) => Promise<FeatureTestResult>
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
    run: (file) =>
      new Promise<FeatureTestResult>((resolve, reject) => {
        const id = nextRequestId
        nextRequestId = nextRequestId + 1
        const request: WorkerRequest = {
          id,
          file
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
    result = await runFeatureFile(message.file)
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

async function runFeatureFile(file: string): Promise<FeatureTestResult> {
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

  try {
    await runFeatureTest(featureFile)
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

  return typeof value.id === 'number' && typeof value.file === 'string'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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
