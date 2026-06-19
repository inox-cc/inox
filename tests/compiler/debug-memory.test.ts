import test from 'node:test'
import {
  debugRuntimeMethodNameFromKnownPath,
  isDebugRuntimeMethodPath
} from '../../compiler/stdlib/descriptors/debug.ts'
import { assert, assertDiagnostic, compileSource } from '../helpers/compiler-smoke.ts'

test('lowers inox.__debug.memory to C debug memory snapshots', () => {
  const result = compileSource(
    `const stats = inox.__debug.memory()
console.log(stats.liveBytes, stats.liveWeakCells)
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.runtimeRequirements, ['debug-memory', 'managed-values', 'objects'])
  assert.match(result.code, /#include "inox\/debug\.h"/)
  assert.match(result.code, /inox_debug_memory_snapshot\(&inox_debug_stats_\d+\)/)
  assert.match(result.code, /\{ "liveBytes", INOX_FIELD_READONLY \}/)
  assert.match(result.code, /\{ "liveWeakCells", INOX_FIELD_READONLY \}/)
  assert.match(result.code, /inox_object_get_known\(stats, 4, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(stats, 10, &inox_log_value_\d+\)/)
})

test('checks inox.__debug.memory argument count', () => {
  assertDiagnostic('inox.__debug.memory(1)', 'INOX_ARG_COUNT')
})

test('recognizes debug runtime method paths', () => {
  assert.equal(isDebugRuntimeMethodPath(['inox', '__debug', 'memory']), true)
  assert.equal(debugRuntimeMethodNameFromKnownPath(['inox', '__debug', 'memory']), 'memory')
  assert.equal(isDebugRuntimeMethodPath(['inox', '__debug', 'gc']), false)
})
