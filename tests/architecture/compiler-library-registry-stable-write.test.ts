import assert from 'node:assert/strict'
import { mkdir, rm, stat, utimes } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { generateCompilerLibraryRegistry } from '../../scripts/lib/compiler-library-registry.ts'

const fixture = resolve('dist/test-tmp/compiler-library-registry-stable-write')
const output = resolve(fixture, 'dist/compiler-libraries')

test('неизменившийся native plan сохраняет timestamp для CMake', async () => {
  await rm(fixture, { recursive: true, force: true })
  await mkdir(resolve(fixture, 'stdlib/global'), { recursive: true })
  await mkdir(resolve(fixture, 'stdlib/node'), { recursive: true })
  await generateCompilerLibraryRegistry(fixture, output)

  const nativePlan = resolve(output, 'native-plan.cmake')
  const stableTimeSeconds = 1_000
  await utimes(nativePlan, stableTimeSeconds, stableTimeSeconds)
  await generateCompilerLibraryRegistry(fixture, output)

  assert.equal((await stat(nativePlan)).mtimeMs, stableTimeSeconds * 1_000)
})
