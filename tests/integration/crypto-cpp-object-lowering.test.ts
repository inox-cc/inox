import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCppModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

const defaultCompilerLibrarySet = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertCryptoMethodsLowerToCppObject(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'

const hashes = crypto.getHashes()
const bytes = crypto.randomBytes(8)
const filled = crypto.randomFillSync(bytes, 0, 4)
const value = crypto.randomInt(5, 10)
const small = crypto.randomInt(5)
const uuid = crypto.randomUUID()
const digest = crypto.hash('sha256', 'test')
const hash = crypto.createHash('sha256')
hash.update('test')
const digestHex = hash.digest('hex')
const chainedDigest = crypto.createHash('sha256').update('test').digest('hex')
const hmac = crypto.createHmac('sha256', 'key')
hmac.update('test')
const hmacDigest = hmac.digest('hex')
const same = crypto.timingSafeEqual(Buffer.from('a'), Buffer.from('a'))

console.log(hashes.length, bytes.length, filled.length, value, small, uuid.length, digest, digestHex, chainedDigest, hmacDigest, same)
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCppModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    libraries: defaultCompilerLibrarySet,
    libraryOptions: [
      { optionId: 'target:runtime#loop-backend', value: 'libuv' },
      { optionId: 'target:runtime#tls-backend', value: 'boringssl' }
    ],
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /crypto\.getHashes\(\)/)
  assert.match(source, /crypto\.randomBytes\(8\)/)
  assert.match(source, /crypto\.randomFillSync\((?:bytes|Uint8Array\(bytes\)), 0, 4\)/)
  assert.match(source, /crypto\.randomInt\(5, 10\)/)
  assert.match(source, /crypto\.randomInt\(5\)/)
  assert.match(source, /crypto\.randomUUID\(\)/)
  assert.match(source, /crypto\.hash\("sha256", "test"\)/)
  assert.match(source, /auto hash = crypto\.createHash\("sha256"\);/)
  assert.match(source, /hash\.update\("test"\);/)
  assert.match(source, /hash\.digest\("hex"\)/)
  assert.match(source, /auto digestHex = hash\.digest\("hex"\);/)
  assert.match(source, /crypto\.createHash\("sha256"\)/)
  assert.match(source, /\.update\("test"\);/)
  assert.match(source, /\.digest\("hex"\)/)
  assert.match(source, /auto hmac = crypto\.createHmac\("sha256", "key"\);/)
  assert.match(source, /hmac\.update\("test"\);/)
  assert.match(source, /hmac\.digest\("hex"\)/)
  assert.match(source, /auto hmacDigest = hmac\.digest\("hex"\);/)
  assert.match(source, /crypto\.timingSafeEqual\(/)
  assert.doesNotMatch(
    source,
    /inox_crypto_(get_hashes|get_random_values|random_bytes|random_fill|random_int|random_uuid|hash_oneshot|timing_safe_equal|hash_(create|update|digest|free)|hmac_(create|update|digest|free))/
  )
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertCryptoMethodsLowerToCppObject()
}
