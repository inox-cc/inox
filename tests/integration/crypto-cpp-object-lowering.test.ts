import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

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

const bytes = crypto.randomBytes(8)
const filled = crypto.randomFillSync(bytes, 0, 4)
const value = crypto.randomInt(5, 10)
const uuid = crypto.randomUUID()
const digest = crypto.hash('sha256', 'test')
const same = crypto.timingSafeEqual(Buffer.from('a'), Buffer.from('a'))

console.log(bytes.length, filled.length, value, uuid.length, digest, same)
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    loopBackend: 'libuv',
    sourceRoot: '/pkg',
    tlsBackend: 'boringssl'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code

  assert.match(source, /crypto\.randomBytes\(8\)/)
  assert.match(source, /crypto\.randomFillSync\(bytes, 0, 4, true\)/)
  assert.match(source, /crypto\.randomInt\(5, 10\)/)
  assert.match(source, /crypto\.randomUUID\(\)/)
  assert.match(source, /crypto\.hashHex\("sha256", inox_value_\d+\)/)
  assert.match(source, /crypto\.timingSafeEqual\(/)
  assert.doesNotMatch(
    source,
    /inox_crypto_(get_hashes|get_random_values|random_bytes|random_fill|random_int|random_uuid|hash_oneshot|timing_safe_equal)/
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
