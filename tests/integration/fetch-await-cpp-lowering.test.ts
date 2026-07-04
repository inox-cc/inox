import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'

type GeneratedTextFile = {
  path: string
  code: string
}

export function assertFetchAwaitUsesCppWrappers(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
async function checkFetch() {
  try {
    const res = await fetch('http://example.com/')
    console.log('Status', res.status)
    const txt = await res.text()
    console.log('Text', txt)
  } catch (error) {
    console.log('#error:', error)
  }
}

await checkFetch()
`
      }
    ],
    {
      root: '/'
    }
  )
  const files = compileFileToCModuleTextsSync('/pkg/src/index.ts', {
    callMain: true,
    host,
    loopBackend: 'libuv',
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code
  const checkFetch = functionSource(source, 'static void checkFetch(void) {')

  assert.doesNotMatch(source, /^static void checkFetch\(void\);$/m)
  assert.match(checkFetch, /static void checkFetch\(void\) \{\n  \{ \/\/ try_0\n    auto res = inox::await_value/)
  assert.doesNotMatch(checkFetch, /static void checkFetch\(void\) \{\n\n  \{/)
  assert.doesNotMatch(checkFetch, /\n  \{\n    \{/)
  assert.match(
    checkFetch,
    /auto res = inox::await_value<inox::FetchResponse>\(inox::fetch\("http:\/\/example.com\/"\)\);/
  )
  assert.match(checkFetch, /console\.log\("Status %\.17g", res\.status\(\)\);/)
  assert.match(
    checkFetch,
    /auto txt = inox::await_value<inox::String>\(res\.text\(\)\);/
  )
  assert.match(
    checkFetch,
    /auto res = inox::await_value<inox::FetchResponse>\(inox::fetch\("http:\/\/example.com\/"\)\);\n\s+if \(inox::thrown\(\)\) goto catch_0;\n\n\s+console\.log\("Status %\.17g", res\.status\(\)\);/
  )
  assert.match(
    checkFetch,
    /auto txt = inox::await_value<inox::String>\(res\.text\(\)\);\n\s+if \(inox::thrown\(\)\) goto catch_0;\n\n\s+console\.log\("Text %\.\*s", txt\);/
  )
  assert.match(checkFetch, /auto error = inox::take_exception\(\);\n\s+console\.log\("#error:", error\);/)
  assert.doesNotMatch(checkFetch, /auto inox_error = inox::take_exception\(\);/)
  assert.doesNotMatch(checkFetch, /auto \w+ = inox::take_exception\(\);\n\s+if \(\(\w+\.tag/)
  assert.doesNotMatch(checkFetch, /auto res = inox_res_\d+\.value\(\);/)
  assert.doesNotMatch(checkFetch, /auto txt = inox_res_\d+\.value\(\);/)
  assert.match(checkFetch, /console\.log\("Text %\.\*s", txt\);/)
  assert.match(
    checkFetch,
    /console\.log\("Text %\.\*s", txt\);\n    goto end_0;\n  \} catch_0: \{/
  )
  assert.match(checkFetch, /\} end_0:;/)
  assert.match(checkFetch, /\} end_0:;\n\}/)
  assert.doesNotMatch(checkFetch, /end_0: ;/)
  assert.doesNotMatch(checkFetch, /end_\d+:\n\s+;/)
  assert.doesNotMatch(checkFetch, /\} end_0:;\n\n\}/)
  assert.doesNotMatch(checkFetch, /else catch_\d+:/)
  assert.doesNotMatch(checkFetch, /inox_error = inox_undefined_value\(\);\n\s+inox_error = inox_res_\d+\.error_value\(\);/)
  assert.doesNotMatch(checkFetch, /inox::FetchResponse res =/)
  assert.doesNotMatch(checkFetch, /inox::String txt =/)
  assert.doesNotMatch(checkFetch, /inox_await_result_\d+/)
  assert.doesNotMatch(checkFetch, /auto inox_res_\d+ = inox::await</)
  assert.doesNotMatch(checkFetch, /inox_res_\d+\.value\(\)/)
  assert.doesNotMatch(checkFetch, /inox_res_\d+\.status\(\)/)
  assert.doesNotMatch(checkFetch, /inox_res_\d+\.valid\(\)/)
  assert.doesNotMatch(checkFetch, /inox_res_\d+\.ok\(\)/)
  assert.doesNotMatch(checkFetch, /inox_res_\d+\.error\(\)/)
  assert.doesNotMatch(checkFetch, /inox_res_\d+\.error_value\(\)/)
  assert.doesNotMatch(checkFetch, /inox_object_get\(res/)
  assert.doesNotMatch(checkFetch, /inox_fetch_response_text\(inox_loop, res/)
  assert.doesNotMatch(checkFetch, /inox_loop/)
  assert.doesNotMatch(checkFetch, /INOX_PROMISE_REJECTED/)
  assert.doesNotMatch(checkFetch, /inox_promise_state/)
  assert.doesNotMatch(checkFetch, /txt_value_\d+/)
  assert.doesNotMatch(checkFetch, /inox_string\* txt/)
}

function functionSource(source: string, signatureStart: string): string {
  const start = source.indexOf(signatureStart)

  assert.notEqual(start, -1, `missing generated function ${signatureStart}`)

  let nextFunction = source.indexOf('\n\nstatic void inox_main', start + signatureStart.length)

  if (nextFunction === -1) {
    nextFunction = source.indexOf('\n\nint main', start + signatureStart.length)
  }

  assert.notEqual(nextFunction, -1, `missing generated function end ${signatureStart}`)

  return source.slice(start, nextFunction)
}

function generatedTextFile(files: GeneratedTextFile[], path: string): GeneratedTextFile {
  for (const file of files) {
    if (file.path === path) {
      return file
    }
  }

  assert.fail(`missing generated file ${path}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertFetchAwaitUsesCppWrappers()
}
