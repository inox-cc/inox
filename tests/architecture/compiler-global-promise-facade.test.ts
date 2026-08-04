import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('global Promise использует package-local declarations-only C++ facade', async () => {
  const header = await readFile('stdlib/global/promise/include/inox/promise.h', 'utf8')
  const source = await readFile('stdlib/global/promise/src/promise.cc', 'utf8')
  const runtimeHeader = await readFile('runtime/include/inox/promise_runtime.h', 'utf8')
  const processSource = await readFile('stdlib/node/process/src/process.cc', 'utf8')

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
  assert.match(header, /Value raw\(\) const;/)
  assert.doesNotMatch(header, /\binline\b/)
  assert.doesNotMatch(header, /\btemplate\s*</)
  assert.doesNotMatch(header, /\)\s*(?:const\s*)?\{/)
  assert.doesNotMatch(header, /extern\s+"C"/)
  assert.doesNotMatch(header, /\binox_promise_(?:new|resolved|rejected|resolve|reject|then|catch|chain|await)\b/)
  assert.doesNotMatch(header, /\bstruct inox_promise\b/)
  assert.doesNotMatch(header, /\binox_promise\s*\*/)
  assert.doesNotMatch(header, /\b(?:adopt|out|reset|release|hasUnhandledRejection)\s*\(/)
  assert.doesNotMatch(header, /operator\s+inox_promise\s*\*/)
  assert.doesNotMatch(header, /operator&\s*\(/)
  assert.match(header, /void\* promise_;/)
  assert.match(source, /Promise Promise::resolve\(Value value\)/)
  assert.match(source, /Promise Promise::reject\(Value error\)/)
  assert.match(source, /inox_status Promise::observe\(/)
  assert.match(source, /return inox_promise_then\(rawPromise\(promise_\), onFulfilled, onRejected, context, finalizer\);/)
  assert.match(source, /inox_status Promise::fulfill\(Value value\) const/)
  assert.match(source, /inox_status Promise::rejectWith\(Value error\) const/)
  assert.match(source, /Value Promise::awaitValue\(\) const/)
  assert.match(source, /Value Promise::raw\(\) const/)
  assert.match(
    source,
    /Value Promise::awaitValue\(\) const \{\n  if \(thrown\(\)\) \{\n    return \{\};\n  \}\n\n  if \(!valid\(\)\) \{\n    throw_value\(Value\(\)\);\n    return \{\};\n  \}/
  )
  assert.match(
    source,
    /if \(status != INOX_OK\) \{\n    if \(!thrown\(\)\) \{\n      throw_value\(Value\(\)\);\n    \}\n\n    return \{\};\n  \}/
  )
  assert.match(source, /Promise PromiseRuntimeBridge::adopt\(inox_promise\* promise\)/)
  assert.doesNotMatch(source, /Promise Promise::adopt\(/)
  assert.doesNotMatch(runtimeHeader, /class Promise\s*\{/)
  assert.doesNotMatch(runtimeHeader, /\btemplate\s*</)
  assert.doesNotMatch(runtimeHeader, /\bawait_value\b/)
  assert.match(runtimeHeader, /class PromiseRuntimeBridge/)
  assert.match(runtimeHeader, /static Promise adopt\(inox_promise\* promise\);/)
  assert.doesNotMatch(processSource, /#include "inox\/promise\.h"/)
})
