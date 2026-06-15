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

test('lowers node:crypto createHash sha256 hex digest to the C crypto runtime', () => {
  const result = compileSource(
    `import { createHash } from 'node:crypto'

const hash = createHash('sha256')
hash.update('hello', 'utf8')
const hex = hash.digest('hex')
console.log(hex)
`,
    {
      ...cLibuvOptions,
      tlsBackend: 'openssl'
    }
  )

  assert.deepEqual(result.ir.features, ['crypto', 'runtime-values'])
  assert.deepEqual(result.ir.runtimeRequirements, ['binary', 'crypto', 'managed-values'])
  assert.match(result.code, /ccjs_crypto_hash\* hash = 0;/)
  assert.match(result.code, /ccjs_crypto_hash_create\(&ccjs_default_allocator, "sha256", 6, &hash\)/)
  assert.match(result.code, /ccjs_crypto_hash_update\(hash, ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_crypto_hash_digest_hex\(&ccjs_default_allocator, hash, &ccjs_crypto_digest_\d+\)/)
  assert.match(result.code, /ccjs_crypto_hash_free\(hash\)/)
})

test('lowers chained node:crypto createHash digest bytes to the C crypto runtime', () => {
  const result = compileSource(
    `import { createHash } from 'node:crypto'

const digest = createHash('sha256').update('hello').digest()
console.log(digest.length)
`,
    {
      ...cLibuvOptions,
      tlsBackend: 'boringssl'
    }
  )

  assert.match(result.code, /ccjs_crypto_hash_create\(&ccjs_default_allocator, "sha256", 6, &ccjs_crypto_hash_\d+\)/)
  assert.match(result.code, /ccjs_crypto_hash_update\(ccjs_crypto_hash_\d+, ccjs_value_\d+\)/)
  assert.match(
    result.code,
    /ccjs_crypto_hash_digest_bytes\(&ccjs_default_allocator, ccjs_crypto_hash_\d+, &ccjs_crypto_digest_\d+\)/
  )
})

test('reports node:crypto createHash without a TLS crypto backend at compile time', () => {
  assert.throws(
    () => {
      compileSource(
        `import { createHash } from 'node:crypto'

createHash('sha256')
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
        error.diagnostics.some((item) =>
          item.message.includes("createHash requires tlsBackend: 'boringssl' or 'openssl'")
        ),
        true
      )
      return true
    }
  )
})

test('reports unsupported node:crypto createHash algorithm and encodings at compile time', () => {
  assert.throws(
    () => {
      compileSource(
        `import { createHash } from 'node:crypto'

createHash('sha1').update('hello', 'latin1').digest('base64')
`,
        {
          ...cLibuvOptions,
          tlsBackend: 'openssl'
        }
      )
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.some((item) => item.message.includes("only supports the 'sha256' algorithm")),
        true
      )
      assert.equal(
        error.diagnostics.some((item) => item.message.includes("Hash.update only supports the 'utf8' input encoding")),
        true
      )
      assert.equal(
        error.diagnostics.some((item) => item.message.includes("Hash.digest only supports the 'hex' encoding")),
        true
      )
      return true
    }
  )
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
        `import { createHmac } from 'node:crypto'

export function main(): void {
  createHmac('sha256', 'secret')
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
        error.diagnostics.some((item) => item.message.includes('node:crypto createHmac is not implemented')),
        true
      )
      return true
    }
  )
})
