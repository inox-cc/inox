import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function assertUrlRuntimeUsesStringFacade(): void {
  const source = readFileSync(resolve('stdlib/node/url/src/url.cc'), 'utf8')

  assert.match(source, /auto out = inox::String\(decoded, decoded_len\);/)
  assert.doesNotMatch(source, /String::fromLiteral\(&inox_default_allocator, decoded, decoded_len/)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertUrlRuntimeUsesStringFacade()
}
