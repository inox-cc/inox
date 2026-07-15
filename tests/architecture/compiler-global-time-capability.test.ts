import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

test('wall и monotonic capabilities принадлежат выбранным time operations', () => {
  assert.throws(() => embedded('Date.now()\n'), capabilityError('wallClock'))
  assert.throws(() => embedded('new Date()\n'), capabilityError('wallClock'))
  assert.doesNotThrow(() => embedded('new Date(0)\n'))
  assert.throws(() => embedded('performance.now()\n'), capabilityError('monotonicClock'))

  const wall = embedded('Date.now()\n', { wallClock: true })
  const monotonic = embedded('performance.now()\n', { monotonicClock: true })

  assert.deepEqual(wall.ir.body[0].expression.libraryCapabilities, ['wallClock'])
  assert.deepEqual(monotonic.ir.body[0].expression.libraryCapabilities, ['monotonicClock'])
})

function embedded(source: string, capabilities: Record<string, boolean> = {}) {
  return compileSource(source, {
    capabilities,
    libraries: defaultCompilerLibrarySet,
    profile: 'embedded'
  })
}

function capabilityError(capability: string): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof CompileError &&
    error.diagnostics.some(
      (diagnostic) => diagnostic.code === 'INOX_CAPABILITY' && diagnostic.message.includes(capability)
    )
}
