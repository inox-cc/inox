import assert from 'node:assert/strict'

import { compileSource } from '../../compiler/core.ts'
import { defaultCompilerLibrarySet } from '../helpers/compiler-libraries.ts'

export function assertNativeClassVoidStringFieldLogMethod(): void {
  const source = `
class Foo {
  name: string

  constructor(name: string) {
    this.name = name
  }

  test() {
    console.log(this.name)
  }
}

const f = new Foo('foo 1')
f.test()
`

  const result = compileSource(source, {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })
  const method = generatedMethodBody(result.code, 'void test()')

  assert.match(result.code, /void test\(\) \{/)
  assert.doesNotMatch(result.code, /void test\(\);/)
  assert.doesNotMatch(result.code, /Foo::test/)
  assert.match(method, /console\.log\("%s", this->name\);/)
  assert.doesNotMatch(method, /inox_string\* name/)
  assert.doesNotMatch(method, /this->name\.raw\(\)\.as\.ref/)
  assert.doesNotMatch(method, /void test\(\) \{\n    \{/)
  assert.doesNotMatch(method, /inox_return/)
  assert.doesNotMatch(method, /cleanup:/)
  assert.doesNotMatch(method, /goto cleanup;/)
  assert.doesNotMatch(method, /this->name\.tag/)
  assert.doesNotMatch(method, /inox_log_string/)
}

export function assertNativeClassLoopReturnKeepsRuntimeReturn(): void {
  const source = `
class Foo {
  test(flag: boolean) {
    while (flag) {
      return 'loop'
    }

    return 'done'
  }
}

`

  const result = compileSource(source, {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.match(result.code, /inox_value test\(bool flag\) \{/)
  assert.doesNotMatch(result.code, /inox_value test\(bool flag\);/)
  assert.doesNotMatch(result.code, /Foo::test/)
}

export function assertNativeClassExplicitUnknownReturnIsPreserved(): void {
  const source = `
class Foo {
  test(): unknown {
    console.log('x')
  }
}
`

  const result = compileSource(source, {
    libraries: defaultCompilerLibrarySet,
    target: 'cc'
  })

  assert.match(result.code, /inox_value test\(\) \{/)
  assert.doesNotMatch(result.code, /inox_value test\(\);/)
  assert.doesNotMatch(result.code, /Foo::test/)
}

function generatedMethodBody(source: string, signature: string): string {
  const start = source.indexOf(`${signature} {`)

  assert.notEqual(start, -1, `missing generated method ${signature}`)

  let depth = 0

  for (let index = source.indexOf('{', start); index < source.length; index = index + 1) {
    const value = source[index]

    if (value === '{') {
      depth = depth + 1
    } else if (value === '}') {
      depth = depth - 1

      if (depth === 0) {
        return source.slice(start, index + 1)
      }
    }
  }

  assert.fail(`missing generated method end for ${signature}`)
}
