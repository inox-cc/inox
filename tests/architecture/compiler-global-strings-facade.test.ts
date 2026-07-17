import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('global strings использует package-local declarations-only C++ facade', async () => {
  const header = await readFile('stdlib/global/strings/include/inox/string.h', 'utf8')
  const source = await readFile('stdlib/global/strings/src/strings.cc', 'utf8')

  assert.match(header, /class String : public Value/)
  assert.match(header, /String trim\(\) const;/)
  assert.match(header, /String slice\(double start, double end\) const;/)
  assert.match(header, /Array split\(StringView separator\) const;/)
  assert.match(header, /bool includes\(StringView search\) const;/)
  assert.match(header, /double charCodeAt\(double offset\) const;/)
  assert.doesNotMatch(header, /\binline\b/)
  assert.doesNotMatch(header, /\btemplate\s*</)
  assert.doesNotMatch(header, /\)\s*(?:const\s*)?\{/)
  assert.match(source, /String String::trim\(\) const/)
  assert.match(source, /String String::slice\(double start, double end\) const/)
  assert.match(source, /Array String::split\(StringView separator\) const/)
  assert.match(source, /bool String::includes\(StringView search\) const/)
  assert.match(source, /double String::charCodeAt\(double offset\) const/)
})
