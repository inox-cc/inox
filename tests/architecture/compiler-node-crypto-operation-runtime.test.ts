import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:crypto проходит через generic variants, adapters и nominal receivers', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = compileSource(
    "import crypto, { hash, randomBytes } from 'node:crypto'\nconst bytes = randomBytes(8)\nconst filled = crypto.randomFillSync(bytes, 0, 4)\nconst hex = hash('sha256', 'payload')\nconst raw = hash('sha256', 'payload', 'buffer')\nconst digest = crypto.createHash('sha256').update('payload', 'utf8').digest('hex')\nconst hmac = crypto.createHmac('sha256', 'key').update('payload').digest()\nconst equal = crypto.timingSafeEqual(bytes, filled)\n",
    {
      libraries,
      libraryOptions: [
        { optionId: 'target:runtime#loop-backend', value: 'libuv' },
        { optionId: 'target:runtime#tls-backend', value: 'boringssl' }
      ],
      target: 'cc'
    }
  )
  const bytes = result.ir.body[1].init
  const filled = result.ir.body[2].init
  const hex = result.ir.body[3].init
  const raw = result.ir.body[4].init
  const digest = result.ir.body[5].init
  const hmac = result.ir.body[6].init

  assert.equal(bytes.libraryOperationId, 'node:crypto#randomBytes')
  assert.equal(filled.libraryOperationId, 'node:crypto#randomFillSync')
  assert.deepEqual(filled.libraryCArgumentAdapters, ['Uint8Array($value)'])
  assert.equal(hex.valueType, 'string')
  assert.equal(hex.libraryCppType, 'inox::String')
  assert.equal(raw.valueType, 'bytes')
  assert.equal(raw.libraryCppType, 'Buffer')
  assert.equal(digest.libraryOperationId, 'node:crypto#Hash#digest')
  assert.equal(digest.valueType, 'string')
  assert.equal(hmac.libraryOperationId, 'node:crypto#Hmac#digest')
  assert.equal(hmac.valueType, 'bytes')
  assert.ok(result.ir.runtimeRequirements.includes('node:crypto'))
  assert.ok(result.ir.runtimeRequirements.includes('node:crypto:hash'))
  assert.match(result.code, /#include "inox\/crypto\.h"/)
  assert.match(result.code, /crypto\.randomFillSync\(Uint8Array\(bytes\), 0, 4\)/)
  assert.match(result.code, /crypto\.hash\("sha256", "payload"\)/)
  assert.match(result.code, /crypto\.hash\("sha256", "payload", "buffer"\)/)
  assert.match(result.code, /\.update\("payload", "utf8"\)/)
  assert.match(result.code, /\.digest\("hex"\)/)
})
