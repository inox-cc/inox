import test from 'node:test'
import { assert, cLibuvOptions, compileSource, CompileError } from '../helpers/compiler-smoke.ts'
import {
  cryptoRuntimeMethodNameFromKnownPath,
  isCryptoRuntimeMethodPath
} from '../../compiler/stdlib/descriptors/crypto.ts'

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
  assert.match(result.code, /#include "inox\/crypto\.h"/)
  assert.match(result.code, /inox_crypto_random_bytes\(&inox_default_allocator, 8, &inox_crypto_bytes_\d+\)/)
  assert.match(result.code, /inox_crypto_random_fill\(bytes, 1, 2, 1\)/)
  assert.match(result.code, /inox_crypto_random_int\(1, 10, &inox_crypto_int_\d+\)/)
  assert.match(result.code, /inox_crypto_random_uuid\(&inox_default_allocator, &inox_crypto_uuid_\d+\)/)
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

  assert.match(result.code, /inox_crypto_random_bytes\(&inox_default_allocator, 4, &inox_crypto_bytes_\d+\)/)
  assert.match(result.code, /inox_crypto_random_fill\(bytes, 0, 0, 0\)/)
  assert.match(result.code, /inox_crypto_random_int\(0, 10, &inox_crypto_int_\d+\)/)
  assert.match(result.code, /inox_crypto_random_uuid\(&inox_default_allocator, &inox_crypto_uuid_\d+\)/)
})

test('recognizes crypto runtime global method paths', () => {
  assert.equal(isCryptoRuntimeMethodPath(['crypto', 'getRandomValues']), true)
  assert.equal(cryptoRuntimeMethodNameFromKnownPath(['crypto', 'getRandomValues']), 'getRandomValues')
  assert.equal(isCryptoRuntimeMethodPath(['crypto', 'randomBytes']), false)
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

  assert.deepEqual(result.ir.features, ['crypto', 'runtime-values', 'string-bytes'])
  assert.deepEqual(result.ir.runtimeRequirements, ['binary', 'crypto', 'managed-values', 'string-bytes'])
  assert.match(result.code, /inox_crypto_hash\* hash = 0;/)
  assert.match(result.code, /inox_crypto_hash_create\(&inox_default_allocator, "sha256", 6, &hash\)/)
  assert.match(result.code, /inox_crypto_hash_update\(hash, inox_value_\d+\)/)
  assert.match(result.code, /inox_crypto_hash_digest_hex\(&inox_default_allocator, hash, &inox_crypto_digest_\d+\)/)
  assert.match(result.code, /inox_crypto_hash_free\(hash\)/)
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

  assert.match(result.code, /inox_crypto_hash_create\(&inox_default_allocator, "sha256", 6, &inox_crypto_hash_\d+\)/)
  assert.match(result.code, /inox_crypto_hash_update\(inox_crypto_hash_\d+, inox_value_\d+\)/)
  assert.match(
    result.code,
    /inox_crypto_hash_digest_bytes\(&inox_default_allocator, inox_crypto_hash_\d+, &inox_crypto_digest_\d+\)/
  )
})

test('lowers node:crypto hash hmac hashes and timing helpers to the C crypto runtime', () => {
  const result = compileSource(
    `import { createHmac, getHashes, hash, timingSafeEqual } from 'node:crypto'

const hex = hash('sha256', 'hello')
const explicitHex = hash('sha256', 'hello', 'hex')
const bytes = hash('sha256', 'hello', 'buffer')
const otherBytes = hash('sha256', 'hello', 'buffer')
const hmac = createHmac('sha256', 'secret')
hmac.update('hello')
console.log(getHashes().length)
console.log(hex)
console.log(explicitHex)
console.log(bytes.length)
console.log(timingSafeEqual(bytes, otherBytes))
console.log(hmac.digest('hex'))
`,
    {
      ...cLibuvOptions,
      tlsBackend: 'openssl'
    }
  )

  assert.deepEqual(result.ir.features, ['binary', 'crypto', 'runtime-values', 'string-bytes'])
  assert.deepEqual(result.ir.runtimeRequirements, ['binary', 'crypto', 'managed-values', 'string-bytes'])
  assert.match(result.code, /inox_crypto_get_hashes\(&inox_default_allocator, &inox_crypto_hashes_\d+\)/)
  assert.match(
    result.code,
    /inox_crypto_hash_oneshot_hex\(&inox_default_allocator, "sha256", 6, inox_value_\d+, &inox_crypto_digest_\d+\)/
  )
  assert.match(
    result.code,
    /inox_crypto_hash_oneshot_bytes\(&inox_default_allocator, "sha256", 6, inox_value_\d+, &inox_crypto_digest_\d+\)/
  )
  assert.match(result.code, /inox_crypto_hmac_create\(&inox_default_allocator, "sha256", 6, inox_value_\d+, &hmac\)/)
  assert.match(result.code, /inox_crypto_hmac_update\(hmac, inox_value_\d+\)/)
  assert.match(result.code, /inox_crypto_hmac_digest_hex\(&inox_default_allocator, hmac, &inox_crypto_digest_\d+\)/)
  assert.match(result.code, /inox_crypto_timing_safe_equal\(bytes, otherBytes, &inox_crypto_equal_\d+\)/)
  assert.match(result.code, /inox_crypto_hmac_free\(hmac\)/)
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
        error.diagnostics.some((item) => item.code === 'INOX_NOT_IMPLEMENTED'),
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

test('reports node:crypto hash and hmac helpers without a TLS crypto backend at compile time', () => {
  assert.throws(
    () => {
      compileSource(
        `import { createHmac, getHashes, hash } from 'node:crypto'

getHashes()
hash('sha256', 'hello')
createHmac('sha256', 'secret')
`,
        cLibuvOptions
      )
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(error.diagnostics.some((item) => item.message.includes('getHashes requires tlsBackend')), true)
      assert.equal(error.diagnostics.some((item) => item.message.includes('hash requires tlsBackend')), true)
      assert.equal(error.diagnostics.some((item) => item.message.includes('createHmac requires tlsBackend')), true)
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

test('reports unsupported node:crypto hash and hmac algorithms and encodings at compile time', () => {
  assert.throws(
    () => {
      compileSource(
        `import { createHmac, hash } from 'node:crypto'

hash('sha1', 'hello', 'base64')
createHmac('sha1', 'secret').update('hello', 'latin1').digest('base64')
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

      assert.equal(error.diagnostics.some((item) => item.message.includes("hash only supports the 'sha256'")), true)
      assert.equal(
        error.diagnostics.some((item) => item.message.includes("hash only supports the 'hex' and 'buffer'")),
        true
      )
      assert.equal(error.diagnostics.some((item) => item.message.includes("createHmac only supports the 'sha256'")), true)
      assert.equal(error.diagnostics.some((item) => item.message.includes("Hmac.update only supports the 'utf8'")), true)
      assert.equal(error.diagnostics.some((item) => item.message.includes("Hmac.digest only supports the 'hex'")), true)
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
        error.diagnostics.some((item) => item.code === 'INOX_NOT_IMPLEMENTED'),
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
        `import { createCipheriv } from 'node:crypto'

export function main(): void {
  createCipheriv('aes-128-cbc', 'secret', 'iv')
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
        error.diagnostics.some((item) => item.code === 'INOX_NOT_IMPLEMENTED'),
        true
      )
      assert.equal(
        error.diagnostics.some((item) => item.message.includes('node:crypto createCipheriv is not implemented')),
        true
      )
      return true
    }
  )
})
