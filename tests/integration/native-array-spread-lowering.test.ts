import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileHostedCpp, compileNativeCpp } from './helpers/generated-cpp.ts'

const source = `
function check(): void {
  const first = ['a']
  const second = [...first]
  console.log(second.length)
}

check()
`

export function assertNativeArraySpreadUsesPreparedFacade(): void {
  assertNativeArraySpread(compileHostedCpp(source))
}

export async function assertNativeCompilerArraySpreadUsesPreparedFacade(compilerPath: string): Promise<void> {
  assertNativeArraySpread(await compileNativeCpp(compilerPath, 'native-array-spread-lowering', source))
}

function assertNativeArraySpread(generated: string): void {
  assert.match(generated, /\.appendAll\(first\);/)
  assert.doesNotMatch(generated, /\.appendAll\(Array\(first\)\);/)
  assert.doesNotMatch(generated, /\.appendAll\(Array\(Array\(/)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertNativeArraySpreadUsesPreparedFacade()
}
