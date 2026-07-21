import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createCompilerSemanticTailDetector,
  type CompilerSemanticVocabularyEntry
} from './helpers/compiler-library-semantic-vocabulary.ts'

const vocabulary: CompilerSemanticVocabularyEntry[] = [
  { category: 'api-member', owner: 'fixture:http', token: 'toString' },
  { category: 'api-root', owner: 'fixture:collections', token: 'Array' },
  { category: 'api-root', owner: 'fixture:http', token: 'HttpServer' },
  { category: 'identity', owner: 'fixture:http', token: 'fixture:http#serve' },
  { category: 'identity', owner: 'fixture:http', token: 'entropy' },
  { category: 'native', owner: 'fixture:http', token: 'inox/fixture-http.h' }
]

test('AST-aware semantic tail detector распознаёт target dispatch без false positive на host use', () => {
  const detect = createCompilerSemanticTailDetector(vocabulary)
  const source = `
    type HostValues = Map<string, Array<string>>
    const safe = Array.isArray(value)
    const syntax = 'ArrayLiteral'
    if (bindingId === 'fixture:http#serve') consume()
    switch (source) { case 'fixture:http#serve': consume() }
    const ids = new Set(['fixture:http#serve'])
    if (operations.has('fixture:http#serve')) consume()
    const fixed = capabilities.entropy
    const descriptor = { property: 'toString' }
    function emitPreparedHttpServerCall() {}
    const include = 'inox/fixture-http.h'
  `
  const tails = detect('compiler/checker.ts', source)

  assert.deepEqual(
    Array.from(new Set(tails.map((tail) => tail.token))).sort(),
    ['HttpServer', 'entropy', 'fixture:http#serve', 'inox/fixture-http.h', 'toString']
  )
  assert.equal(tails.some((tail) => tail.token === 'Array'), false)
})

test('AST-aware semantic tail detector разрешает только точный host import adapter', () => {
  const detect = createCompilerSemanticTailDetector([
    { category: 'identity', owner: 'node:fs', token: 'node:fs' }
  ])

  assert.deepEqual(detect('compiler/node-host.ts', "import fs from 'node:fs'\n"), [])
  assert.deepEqual(
    detect('compiler/checker.ts', "import fs from 'node:fs'\n").map((tail) => tail.token),
    ['node:fs']
  )
})
