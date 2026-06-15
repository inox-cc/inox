import test from 'node:test'
import { assert, cLibuvOptions, compileSource, CompileError } from '../helpers/compiler-smoke.ts'

test('lowers default node:crypto random methods to the C crypto runtime', () => {
  const result = compileSource(
    `import crypto from 'node:crypto'

export function main(): void {
  const bytes = crypto.randomBytes(8)
  const filled = crypto.randomFillSync(bytes, 1, 2)
  console.log(filled.length)
  console.log(crypto.randomInt(1, 10))
  console.log(crypto.randomUUID())
}
`,
    cLibuvOptions
  )

  assert.deepEqual(result.ir.features, ['binary', 'crypto', 'runtime-values', 'string-bytes'])
  assert.deepEqual(result.ir.runtimeRequirements, ['binary', 'crypto', 'managed-values', 'string-bytes'])
  assert.match(result.code, /#include "ccjs\/crypto\.h"/)
  assert.match(result.code, /ccjs_crypto_random_bytes\(&ccjs_default_allocator, 8, &ccjs_crypto_bytes_\d+\)/)
  assert.match(result.code, /ccjs_crypto_random_fill\(bytes, 1, 2, 1\)/)
  assert.match(result.code, /ccjs_crypto_random_int\(1, 10, &ccjs_crypto_int_\d+\)/)
  assert.match(result.code, /ccjs_crypto_random_uuid\(&ccjs_default_allocator, &ccjs_crypto_uuid_\d+\)/)
})

test('lowers named node:crypto random imports to the C crypto runtime', () => {
  const result = compileSource(
    `import { randomBytes, randomFillSync, randomInt, randomUUID } from 'node:crypto'

export function main(): void {
  const bytes = randomBytes(4)
  randomFillSync(bytes)
  console.log(bytes.length, randomInt(10), randomUUID())
}
`,
    cLibuvOptions
  )

  assert.match(result.code, /ccjs_crypto_random_bytes\(&ccjs_default_allocator, 4, &ccjs_crypto_bytes_\d+\)/)
  assert.match(result.code, /ccjs_crypto_random_fill\(bytes, 0, 0, 0\)/)
  assert.match(result.code, /ccjs_crypto_random_int\(0, 10, &ccjs_crypto_int_\d+\)/)
  assert.match(result.code, /ccjs_crypto_random_uuid\(&ccjs_default_allocator, &ccjs_crypto_uuid_\d+\)/)
})

test('reports node:crypto imports without libuv at compile time', () => {
  assert.throws(
    () => {
      compileSource(
        `import crypto from 'node:crypto'

export function main(): void {
  console.log(crypto.randomUUID())
}
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
        error.diagnostics.some((item) => item.message.includes('node:crypto is not implemented for C without libuv')),
        true
      )
      return true
    }
  )
})

test('reports unsupported node:crypto methods at compile time only', () => {
  assert.throws(
    () => {
      compileSource(
        `import { createHash } from 'node:crypto'

export function main(): void {
  createHash('sha256')
}
`,
        cLibuvOptions
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
        error.diagnostics.some((item) => item.message.includes('node:crypto createHash is not implemented')),
        true
      )
      return true
    }
  )
})
