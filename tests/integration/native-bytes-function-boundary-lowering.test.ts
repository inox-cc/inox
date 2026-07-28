import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileHostedCpp, compileNativeCpp } from './helpers/generated-cpp.ts'

const source = `
import { Buffer } from 'node:buffer'

function passBytes(value: Uint8Array): Uint8Array {
  return value
}

function passBuffer(value: Buffer): Buffer {
  return value
}

function check(): void {
  const bytes = new Uint8Array(2)
  const buffer = Buffer.from('x')
  const sameBytes = passBytes(bytes)
  const sameBuffer = passBuffer(buffer)
  console.log(sameBytes.length, sameBuffer.length)
}

check()
`

export function assertNativeBytesKeepCppFunctionBoundaries(): void {
  assertNativeBytesBoundaries(compileHostedCpp(source))
}

export async function assertNativeCompilerBytesKeepCppFunctionBoundaries(compilerPath: string): Promise<void> {
  assertNativeBytesBoundaries(await compileNativeCpp(compilerPath, 'native-bytes-function-boundary-lowering', source))
}

function assertNativeBytesBoundaries(generated: string): void {
  assert.match(generated, /(?:static )?Uint8Array passBytes\(Uint8Array value\)/)
  assert.match(generated, /(?:static )?Buffer passBuffer\(Buffer value\)/)
  assert.match(generated, /auto sameBytes = passBytes\(bytes\);/)
  assert.match(generated, /auto sameBuffer = passBuffer\(buffer\);/)
  assert.doesNotMatch(generated, /\binox_value pass(?:Bytes|Buffer)\(/)
  assert.doesNotMatch(generated, /passBytes\(Uint8Array\(bytes\)\)/)
  assert.doesNotMatch(generated, /passBuffer\(Buffer\(buffer\)\)/)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertNativeBytesKeepCppFunctionBoundaries()
}
