import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileHostedCpp, compileNativeCpp } from './helpers/generated-cpp.ts'

const source = `
const handle = setTimeout(() => {
  console.log('tick')
}, 0)

clearTimeout(handle)
`

export function assertNativeTimerHandleArgumentStaysDirect(): void {
  assertNativeTimerHandleArgument(compileHostedCpp(source))
}

export async function assertNativeCompilerTimerHandleArgumentStaysDirect(compilerPath: string): Promise<void> {
  assertNativeTimerHandleArgument(await compileNativeCpp(compilerPath, 'native-timer-handle-argument-lowering', source))
}

function assertNativeTimerHandleArgument(generated: string): void {
  assert.match(generated, /timers\.clearTimeout\(handle\);/)
  assert.doesNotMatch(generated, /TimeoutHandle\(inox::Value\(handle\)\)/)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertNativeTimerHandleArgumentStaysDirect()
}
