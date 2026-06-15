import test from 'node:test'
import { assert, compileSource, CompileError } from '../helpers/compiler-smoke.ts'

test('lowers node:timers named and default imports to timer runtime calls', () => {
  const result = compileSource(
    `import timers, { clearTimeout, setTimeout as later } from 'node:timers'

function onTimeout(): void {
  console.log('timeout')
}

const timeout = later(onTimeout, 1)
clearTimeout(timeout)
const immediate = timers.setImmediate(onTimeout)
timers.clearImmediate(immediate)
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['timers'])
  assert.deepEqual(result.ir.runtimeRequirements, ['async-runtime', 'callback-values', 'managed-values', 'timers'])
  assert.match(
    result.code,
    /ccjs_loop_set_timeout\(&ccjs_loop, 1, ccjs_timer_callback_run, ccjs_timer_ctx_\d+, ccjs_timer_callback_finalize, &timeout\)/
  )
  assert.match(
    result.code,
    /ccjs_loop_queue_immediate\(&ccjs_loop, ccjs_timer_callback_run, ccjs_timer_ctx_\d+, ccjs_timer_callback_finalize, &immediate\)/
  )
  assert.match(result.code, /ccjs_loop_clear_timer\(timeout\);/)
  assert.match(result.code, /ccjs_loop_clear_timer\(immediate\);/)
})

test('reports embedded timer capability diagnostics for node:timers imports', () => {
  assert.throws(
    () => {
      compileSource(
        `import { setTimeout } from 'node:timers'

setTimeout(() => {
  console.log('timer')
}, 1)
`,
        {
          target: 'c',
          profile: 'embedded'
        }
      )
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(error.diagnostics.some((item) => item.code === 'CCJS_CAPABILITY'), true)
      assert.equal(
        error.diagnostics.some((item) =>
          item.message.includes('embedded profile requires timers capability for setTimeout')
        ),
        true
      )
      return true
    }
  )
})
