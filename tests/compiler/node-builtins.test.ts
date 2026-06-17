import test from 'node:test'
import { assert, compileSource, CompileError } from '../helpers/compiler-smoke.ts'
import {
  isUnsupportedRuntimeBuiltinImportSource,
  unsupportedRuntimeBuiltinImportMessage,
  unsupportedRuntimeBuiltinImportSources
} from '../../src/compiler/stdlib/descriptors/node-builtins.ts'

test('reports recognized but unsupported node builtin imports at compile time', () => {
  for (const source of unsupportedRuntimeBuiltinImportSources) {
    assert.throws(
      () => {
        compileSource(
          `import builtin from '${source}'

console.log(builtin)
`,
          {
            target: 'c'
          }
        )
      },
      (error) => {
        if (!(error instanceof CompileError)) {
          return false
        }

        assert.equal(
          error.diagnostics.some((item) => item.code === 'CCJS_NOT_IMPLEMENTED'),
          true
        )
        assert.equal(
          error.diagnostics.some((item) => item.message.includes(source)),
          true
        )
        return true
      },
      source
    )
  }
})

test('does not classify unknown package imports as runtime builtins', () => {
  assert.equal(unsupportedRuntimeBuiltinImportMessage('left-pad'), null)
  assert.equal(unsupportedRuntimeBuiltinImportMessage('./node:path'), null)
  assert.equal(isUnsupportedRuntimeBuiltinImportSource('node:https'), true)
  assert.equal(isUnsupportedRuntimeBuiltinImportSource('node:path'), false)
})
