import test from 'node:test'
import { assert, compileSource, CompileError } from '../helpers/compiler-smoke.ts'

test('lowers node:buffer named and namespace Buffer helpers to binary runtime', () => {
  const result = compileSource(
    `import buffer, { Buffer, constants } from 'node:buffer'

const bytes = Buffer.from('hi', 'utf8')
const allocated = buffer.Buffer.alloc(2)
console.log(Buffer.isBuffer(bytes), Buffer.isBuffer('x'), bytes.toString(), allocated.length)
console.log(constants.MAX_LENGTH, buffer.constants.MAX_LENGTH)
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['binary', 'runtime-values', 'string-bytes'])
  assert.deepEqual(result.ir.runtimeRequirements, ['binary', 'managed-values', 'string-bytes'])
  assert.match(result.code, /#include "inox\/binary\.h"/)
  assert.match(result.code, /inox_bytes_from_data\(&inox_default_allocator,/)
  assert.match(result.code, /inox_bytes_new\(&inox_default_allocator,/)
  assert.match(result.code, /\.tag == INOX_TAG_BYTES/)
  assert.match(result.code, /\(\(double\)\(\(size_t\)-1\)\)/)
})

test('reports unsupported node:buffer helpers at compile time only', () => {
  assert.throws(
    () => {
      compileSource(
        `import { transcode } from 'node:buffer'

transcode(Buffer.from('hi'), 'utf8', 'latin1')
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
        error.diagnostics.some((item) => item.code === 'INOX_NOT_IMPLEMENTED'),
        true
      )
      assert.equal(
        error.diagnostics.some((item) => item.message.includes('node:buffer transcode is not implemented')),
        true
      )
      return true
    }
  )
})
