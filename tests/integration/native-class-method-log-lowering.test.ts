import assert from 'node:assert/strict'

import { compileSource } from '../../compiler/core.ts'

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
    target: 'cc'
  })
  const method = generatedMethodBody(result.code, 'void Foo::test()')

  assert.match(result.code, /void test\(\);/)
  assert.doesNotMatch(result.code, /inox_value test\(\);/)
  assert.match(method, /console\.log\("%\.\*s", \(int\)this->name\.length\(\), this->name\.bytes\(\)\);/)
  assert.doesNotMatch(method, /inox_string\* name/)
  assert.doesNotMatch(method, /this->name\.raw\(\)\.as\.ref/)
  assert.doesNotMatch(method, /void Foo::test\(\) \{\n  \{/)
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
    target: 'cc'
  })

  assert.match(result.code, /inox_value test\(double flag\);/)
  assert.match(result.code, /inox_value Foo::test\(double flag\)/)
  assert.doesNotMatch(result.code, /void test\(double flag\);/)
  assert.doesNotMatch(result.code, /void Foo::test\(double flag\)/)
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
    target: 'cc'
  })

  assert.match(result.code, /inox_value test\(\);/)
  assert.match(result.code, /inox_value Foo::test\(\)/)
  assert.doesNotMatch(result.code, /void test\(\);/)
  assert.doesNotMatch(result.code, /void Foo::test\(\)/)
}

function generatedMethodBody(source: string, signature: string): string {
  const start = source.indexOf(`${signature} {`)

  assert.notEqual(start, -1, `missing generated method ${signature}`)

  const end = source.indexOf('\n\nint main', start)

  assert.notEqual(end, -1, `missing generated method end for ${signature}`)

  return source.slice(start, end)
}
