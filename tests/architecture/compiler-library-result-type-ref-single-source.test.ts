import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const files = ['compiler/extensions/types.ts', 'compiler/extensions/library-set-builder.ts', 'compiler/checker.ts']

test('resultTypeRef остаётся единственным каналом semantic result type', async () => {
  for (const file of files) {
    const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8')

    assert.doesNotMatch(source, /\bcResultCppType\b/, file)
    assert.doesNotMatch(source, /\bresultNullable\b/, file)
  }
})
