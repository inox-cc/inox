import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('global Promise использует package-local declarations-only C++ facade', async () => {
  const header = await readFile('stdlib/global/promise/include/inox/promise.h', 'utf8')
  const source = await readFile('stdlib/global/promise/src/promise.cc', 'utf8')
  const runtimeHeader = await readOptionalFile('runtime/include/inox/promise.h')

  assert.match(header, /class Promise/)
  assert.match(header, /static Promise resolve\(Value value\);/)
  assert.match(header, /static Promise reject\(Value error\);/)
  assert.match(header, /Promise then\(/)
  assert.match(header, /Promise catchError\(/)
  assert.match(header, /using PromiseReactionCallback = inox_status \(\*\)\(void\* context, inox_value value\);/)
  assert.match(header, /inox_status observe\(/)
  assert.match(header, /inox_status fulfill\(Value value\) const;/)
  assert.match(header, /inox_status rejectWith\(Value error\) const;/)
  assert.match(header, /Value awaitValue\(\) const;/)
  assert.doesNotMatch(header, /\binline\b/)
  assert.doesNotMatch(header, /\btemplate\s*</)
  assert.doesNotMatch(header, /\)\s*(?:const\s*)?\{/)
  assert.doesNotMatch(header, /extern\s+"C"/)
  assert.doesNotMatch(header, /\binox_promise_(?:new|resolved|rejected|resolve|reject|then|catch|chain|await)\b/)
  assert.match(source, /Promise Promise::resolve\(Value value\)/)
  assert.match(source, /Promise Promise::reject\(Value error\)/)
  assert.match(source, /inox_status Promise::observe\(/)
  assert.match(source, /return inox_promise_then\(promise_, onFulfilled, onRejected, context, finalizer\);/)
  assert.match(source, /inox_status Promise::fulfill\(Value value\) const/)
  assert.match(source, /inox_status Promise::rejectWith\(Value error\) const/)
  assert.match(source, /Value Promise::awaitValue\(\) const/)
  assert.doesNotMatch(runtimeHeader, /class Promise/)
  assert.doesNotMatch(runtimeHeader, /\btemplate\s*</)
  assert.doesNotMatch(runtimeHeader, /\bawait_value\b/)
})

async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}
