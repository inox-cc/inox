import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  compileFile,
  compileGraphToIrModules,
  compileSource,
  compileSourceToIr,
  emitTargetFromIr,
  runCStaticChecks
} from '../src/compiler/index.ts'

test('compiles source to IR before emitting target code', () => {
  const compiled = compileSourceToIr(
    `export function main(): void {
  console.log('hello')
}
`,
    { target: 'js' }
  )

  assert.equal(compiled.target, 'js')
  assert.equal(compiled.ir.type, 'IrProgram')
  assert.doesNotMatch(JSON.stringify(compiled), /"code"/)
  assert.match(emitTargetFromIr('js', compiled.ir), /function main\(\)/)
  assert.equal(
    compileSource(
      `export function main(): void {
  console.log('hello')
}
`,
      { target: 'js' }
    ).code,
    emitTargetFromIr('js', compiled.ir)
  )
})

test('runs C static checks as a separate pipeline helper', () => {
  const compiled = compileSourceToIr('const value: number = 1\n', { target: 'c' })

  assert.doesNotThrow(() => runCStaticChecks([compiled.ir]))
  assert.match(emitTargetFromIr('c', compiled.ir), /int main\(void\)/)
})

test('compiles module graphs to IR modules before target bundle emission', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-pipeline-'))

  try {
    const entry = join(dir, 'index.ts')
    const dep = join(dir, 'dep.ts')
    await writeFile(dep, 'export function value(): number { return 7 }\n')
    await writeFile(
      entry,
      `import { value } from './dep'

export function main(): void {
  console.log(value())
}
`
    )

    const compiled = await compileGraphToIrModules(entry, { target: 'js' })

    assert.equal(compiled.target, 'js')
    assert.deepEqual(
      compiled.irModules.map((module) => module.path),
      [dep, entry]
    )

    const result = await compileFile(entry, { target: 'js' })

    assert.deepEqual(
      result.graph.modules.map((module) => module.path),
      compiled.graph.modules.map((module) => module.path)
    )
    assert.match(result.code, /function value\(\)/)
    assert.match(result.code, /function main\(\)/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
