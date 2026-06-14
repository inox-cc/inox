import test from 'node:test'
import { assert, assertDiagnostic, compileSource } from '../helpers/compiler-smoke.ts'

test('lowers ccjs.__debug.memory to C debug memory snapshots', () => {
  const result = compileSource(
    `const stats = ccjs.__debug.memory()
console.log(stats.liveBytes, stats.liveWeakCells)
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.runtimeRequirements, ['debug-memory', 'managed-values', 'objects'])
  assert.match(result.code, /#include "ccjs\/debug\.h"/)
  assert.match(result.code, /ccjs_debug_memory_snapshot\(&ccjs_debug_stats_\d+\)/)
  assert.match(result.code, /\{ "liveBytes", CCJS_FIELD_READONLY \}/)
  assert.match(result.code, /\{ "liveWeakCells", CCJS_FIELD_READONLY \}/)
  assert.match(result.code, /ccjs_object_get_known\(stats, 4, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(stats, 10, &ccjs_log_value_\d+\)/)
})

test('checks ccjs.__debug.memory argument count', () => {
  assertDiagnostic('ccjs.__debug.memory(1)', 'CCJS_ARG_COUNT')
})
