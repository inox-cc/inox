import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { runPackageNpm } from '../../scripts/package-npm.ts'

test('package:npm reports a missing native build without a stack trace', async () => {
  const sourceRoot = await mkdtemp(join(tmpdir(), 'inox-package-npm-'))
  const errors: string[] = []
  const logs: string[] = []

  try {
    await writeFile(
      join(sourceRoot, 'package.json'),
      JSON.stringify({
        engines: { node: '>=24' },
        license: 'Apache-2.0',
        name: '@inox-cc/inox',
        type: 'module',
        version: '0.0.1'
      })
    )

    const exitCode = await runPackageNpm(sourceRoot, join(sourceRoot, 'dist/npm'), {
      error: (message: string) => errors.push(message),
      log: (message: string) => logs.push(message)
    })

    assert.equal(exitCode, 1)
    assert.deepEqual(logs, [])
    assert.deepEqual(errors, [
      `Cannot package Inox: native compiler is missing.\n\n` +
        `Expected:\n  ${join(sourceRoot, 'dist/inox')}\n\n` +
        'From the Inox repository, run:\n  pnpm build'
    ])
    assert.doesNotMatch(errors[0] ?? '', /\n\s+at /)
  } finally {
    await rm(sourceRoot, { recursive: true, force: true })
  }
})
