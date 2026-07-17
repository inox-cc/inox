import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { compileFileToCModuleTextsSync } from '../../compiler/core.ts'
import { createMemoryCompilerHost } from '../../compiler/memory-host.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

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
    const post = await fetch('http://example.com/post', {
      method: 'POST',
      headers: { Accept: 'text/plain' },
      body: 'ping',
      redirect: 'follow'
    })
    console.log('Post', post.ok)
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
    libraries: defaultCompilerLibrarySet,
    loopBackend: 'libuv',
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code
  const checkFetch = functionSource(source, 'static void checkFetch(void) {')

  assert.doesNotMatch(source, /^static void checkFetch\(void\);$/m)
  assert.match(checkFetch, /static void checkFetch\(void\) \{\n  inox::Promise inox_library_promise_\d+;/)
  assert.match(checkFetch, /\n  \{ \/\/ try_0\n/)
  assert.doesNotMatch(checkFetch, /static void checkFetch\(void\) \{\n\n  \{/)
  assert.doesNotMatch(checkFetch, /\n  \{\n    \{/)
  assert.match(
    checkFetch,
    /inox_library_promise_(\d+) = inox::fetch\("http:\/\/example.com\/"\);\n    if \(!inox_library_promise_\1\.valid\(\)\) return;\n    auto inox_await_value_\d+ = \(inox_library_promise_\1\)\.awaitValue\(\);[\s\S]*?auto res = inox::FetchResponse\(inox_await_value_\d+\);/
  )
  assert.match(checkFetch, /console\.log\("Status %\.17g", \(\(double\)res\.status\)\);/)
  assert.match(
    checkFetch,
    /inox_library_promise_(\d+) = res\.text\(\);\n    if \(!inox_library_promise_\1\.valid\(\)\) return;\n    auto inox_await_value_\d+ = \(inox_library_promise_\1\)\.awaitValue\(\);[\s\S]*?auto txt = inox::String\(inox_await_value_\d+\);/
  )
  assert.match(checkFetch, /auto inox_object_\d+ = inox::ObjectValue::create\(&inox_shape_value_\d+\);/)
  assert.match(checkFetch, /\.init\(0, inox::String\("POST", 4\)\);/)
  assert.match(checkFetch, /\.init\(0, inox::String\("text\/plain", 10\)\);/)
  assert.match(
    checkFetch,
    /inox_library_promise_(\d+) = inox::fetch\("http:\/\/example.com\/post", inox_object_\d+\);\n    if \(!inox_library_promise_\1\.valid\(\)\) return;\n    auto inox_await_value_\d+ = \(inox_library_promise_\1\)\.awaitValue\(\);[\s\S]*?auto post = inox::FetchResponse\(inox_await_value_\d+\);/
  )
  assert.match(
    checkFetch,
    /auto inox_await_value_\d+ = \(inox_library_promise_\d+\)\.awaitValue\(\);\n\s+if \(inox::thrown\(\)\) goto catch_0;[\s\S]*?auto res = inox::FetchResponse\(inox_await_value_\d+\);\n\n\s+console\.log\("Status %\.17g", \(\(double\)res\.status\)\);/
  )
  assert.match(
    checkFetch,
    /auto inox_await_value_\d+ = \(inox_library_promise_\d+\)\.awaitValue\(\);\n\s+if \(inox::thrown\(\)\) goto catch_0;[\s\S]*?auto txt = inox::String\(inox_await_value_\d+\);\n\n\s+console\.log\("Text %s", txt\);/
  )
  assert.match(checkFetch, /auto error = inox::take_exception\(\);\n\s+console\.log\("#error:", error\);/)
  assert.doesNotMatch(checkFetch, /auto inox_error = inox::take_exception\(\);/)
  assert.doesNotMatch(checkFetch, /auto \w+ = inox::take_exception\(\);\n\s+if \(\(\w+\.tag/)
  assert.doesNotMatch(checkFetch, /auto res = inox_res_\d+\.value\(\);/)
  assert.doesNotMatch(checkFetch, /auto txt = inox_res_\d+\.value\(\);/)
  assert.match(checkFetch, /console\.log\("Text %s", txt\);/)
  assert.match(
    checkFetch,
    /console\.log\("Post %d", post\.ok\);\n    goto end_0;\n  \} catch_0: \{/
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
  assert.doesNotMatch(checkFetch, /inox::await_value</)
  assert.doesNotMatch(checkFetch, /inox_res_\d+\.value\(\)/)
  assert.doesNotMatch(checkFetch, /inox_res_\d+\.status\(\)/)
  assert.doesNotMatch(checkFetch, /inox_res_\d+\.valid\(\)/)
  assert.doesNotMatch(checkFetch, /inox_res_\d+\.ok\(\)/)
  assert.doesNotMatch(checkFetch, /inox_res_\d+\.error\(\)/)
  assert.doesNotMatch(checkFetch, /inox_res_\d+\.error_value\(\)/)
  assert.doesNotMatch(checkFetch, /inox_object_get\(res/)
  assert.doesNotMatch(checkFetch, /inox_fetch_response_text\(inox_loop, res/)
  assert.doesNotMatch(checkFetch, /inox::FetchHeader/)
  assert.doesNotMatch(checkFetch, /inox::FetchInit/)
  assert.doesNotMatch(checkFetch, /inox_loop/)
  assert.doesNotMatch(checkFetch, /INOX_PROMISE_REJECTED/)
  assert.doesNotMatch(checkFetch, /inox_promise_state/)
  assert.doesNotMatch(checkFetch, /txt_value_\d+/)
  assert.doesNotMatch(checkFetch, /inox_string\* txt/)
}

export function assertFetchRuntimeFacadesUseCppObjects(): void {
  const host = createMemoryCompilerHost(
    [
      {
        path: '/pkg/src/index.ts',
        source: `
async function checkFetchFacade() {
  const controller = new AbortController()
  controller.abort()
  const res = await fetch('http://example.com/', { signal: controller.signal })
  console.log(res.headers.has('content-type'), res.headers.get('content-type'))
}

await checkFetchFacade()
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
    libraries: defaultCompilerLibrarySet,
    loopBackend: 'libuv',
    sourceRoot: '/pkg'
  }) as GeneratedTextFile[]
  const source = generatedTextFile(files, 'src/index.cc').code
  const checkFetchFacade = functionSource(source, 'static void checkFetchFacade(void) {')

  assert.match(checkFetchFacade, /auto controller = inox::AbortController\(\);/)
  assert.match(checkFetchFacade, /controller\.abort\(\);/)
  assert.match(checkFetchFacade, /\.init\(0, controller\.signal\);/)
  assert.match(checkFetchFacade, /res\.headers\.has\("content-type"\)/)
  assert.match(checkFetchFacade, /res\.headers\.get\("content-type"\)/)
  assert.doesNotMatch(checkFetchFacade, /inox::AbortController\(controller\)/)
  assert.doesNotMatch(checkFetchFacade, /inox::FetchHeaders\(/)
  assert.doesNotMatch(source, /fetch_abort_controller/)
  assert.doesNotMatch(source, /fetch_headers_(?:get|has)/)
}

export function assertFetchRuntimeFacadesDoNotExposeRawConstructors(): void {
  const header = readFileSync(resolve('stdlib/global/fetch/include/inox/fetch.h'), 'utf8')
  const source = readFileSync(resolve('stdlib/global/fetch/src/fetch.cc'), 'utf8')

  assert.doesNotMatch(header, /FetchHeaders\(inox_value/)
  assert.doesNotMatch(header, /AbortController\(inox_value/)
  assert.doesNotMatch(source, /FetchHeaders::FetchHeaders\(inox_value/)
  assert.doesNotMatch(source, /AbortController::AbortController\(inox_value/)
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
  assertFetchRuntimeFacadesUseCppObjects()
  assertFetchRuntimeFacadesDoNotExposeRawConstructors()
}
