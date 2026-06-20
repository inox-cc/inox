import assert from 'node:assert/strict'
import { availableParallelism } from 'node:os'
import { test } from 'node:test'

import {
  assertCcAvailable,
  collectFeatureTestFiles,
  type FeatureTestFile,
  featureTestName,
  readFeatureTestFile,
  runFeatureTest
} from './helpers/feature-tests.ts'

await assertCcAvailable()

const files = await collectFeatureTestFiles(process.argv.slice(2))
const parallelism = availableParallelism()

assert.notEqual(files.length, 0, 'feature tests: no .test.ts files found')

if (process.env.INOX_FEATURE_TEST_REPORT === 'verbose') {
  await runVerboseFeatureTests()
} else {
  await runBriefFeatureTests()
}

async function runVerboseFeatureTests(): Promise<void> {
  await test('compiler feature matrix', { concurrency: parallelism }, async (t) => {
    await Promise.all(
      files.map((file) =>
        t.test(featureTestName(file), async (context) => {
          const featureFile = await readFeatureTestFile(file)

          if (!featureFile.targets.includes('c')) {
            context.skip(`targets: ${featureFile.targets.join(', ')}`)
            return
          }

          await runFeatureTest(featureFile)
        })
      )
    )
  })
}

async function runBriefFeatureTests(): Promise<void> {
  const results = await runWithConcurrency(files, parallelism, runBriefFeatureFile)
  const passed = results.filter((result) => result === 'passed').length
  const failed = results.filter((result) => result === 'failed').length
  const skipped = results.filter((result) => result === 'skipped').length

  console.log(`passed: ${passed}`)
  console.log(`failed: ${failed}`)
  console.log(`skipped: ${skipped}`)
  console.log(`total: ${files.length}`)

  if (failed > 0) {
    process.exitCode = 1
  }
}

async function runBriefFeatureFile(file: string): Promise<'passed' | 'failed' | 'skipped'> {
  let featureFile: FeatureTestFile

  try {
    featureFile = await readFeatureTestFile(file)
  } catch (error) {
    console.error(formatBriefFailure(featureTestName(file), error))
    return 'failed'
  }

  if (!featureFile.targets.includes('c')) {
    return 'skipped'
  }

  try {
    await runFeatureTest(featureFile)
    return 'passed'
  } catch (error) {
    console.error(formatBriefFailure(featureFile.name, error))
    return 'failed'
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  runItem: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex = nextIndex + 1
        results[index] = await runItem(items[index])
      }
    })
  )

  return results
}

function formatBriefFailure(name: string, error: unknown): string {
  if (error instanceof Error) {
    return [`${name}: failed`, error.stack ?? error.message].join('\n')
  }

  return [`${name}: failed`, String(error)].join('\n')
}
