import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compilerLibrarySemanticVocabulary,
  createCompilerSemanticTailDetector,
  type CompilerSemanticVocabularyEntry
} from './helpers/compiler-library-semantic-vocabulary.ts'

const vocabulary: CompilerSemanticVocabularyEntry[] = [
  { category: 'api-member', owner: 'fixture:http', token: 'toString' },
  { category: 'api-member', owner: 'fixture:http', token: 'ok' },
  { category: 'api-member', owner: 'fixture:events', token: 'on' },
  { category: 'api-member', owner: 'fixture:fs', token: 'rm' },
  { category: 'api-member', owner: 'fixture:collections', token: 'push' },
  { category: 'api-member', owner: 'fixture:collections', token: 'get' },
  { category: 'api-member', owner: 'fixture:collections', token: 'join' },
  { category: 'api-root', owner: 'fixture:collections', token: 'Array' },
  { category: 'api-root', owner: 'fixture:conversions', token: 'f32' },
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

test('semantic vocabulary сохраняет короткие globals и members из реальных packages', async () => {
  const inventory = await compilerLibrarySemanticVocabulary()

  for (const token of ['f32', 'ok', 'on', 'rm']) {
    assert.equal(
      inventory.entries.some(
        (entry) => (entry.category === 'api-root' || entry.category === 'api-member') && entry.token === token
      ),
      true,
      token
    )
  }
})

test('AST-aware semantic tail detector ловит короткий API только в semantic dispatch', () => {
  const detect = createCompilerSemanticTailDetector(vocabulary)
  const source = `
    if (callee === 'f32') consume()
    if (method === 'rm') consume()
    const descriptor = { member: 'on' }
    if (properties.has('ok')) consume()
    switch (method) { case 'push': consume() }
    if (methods.has('get')) consume()
    switch (member) { case 'join': consume() }
    function resolveF32Global() {}
    function emitOnMember() {}

    const mode = 'on'
    emitter.on(listener)
    response.ok
    const body = node.body
    const kind = 'type'
  `
  const tails = detect('compiler/checker.ts', source)

  assert.deepEqual(
    Array.from(new Set(tails.map((tail) => tail.token))).sort(),
    ['f32', 'get', 'join', 'ok', 'on', 'push', 'rm']
  )
})
