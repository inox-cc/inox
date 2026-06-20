import assert from 'node:assert/strict'
import { availableParallelism } from 'node:os'
import { test } from 'node:test'

import {
  assertCcAvailable,
  collectFeatureTestFiles,
  featureTestName,
  readFeatureTestFile,
  runFeatureTest
} from './helpers/feature-tests.ts'

await assertCcAvailable()

const files = await collectFeatureTestFiles(process.argv.slice(2))
const parallelism = availableParallelism()

assert.notEqual(files.length, 0, 'feature tests: no .test.ts files found')

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
