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
    { target: 'c' }
  )

  assert.equal(compiled.target, 'c')
  assert.equal(compiled.ir.type, 'IrProgram')
  assert.doesNotMatch(JSON.stringify(compiled), /"code"/)
  assert.match(emitTargetFromIr('c', compiled.ir), /int main\(void\)/)
  assert.equal(
    compileSource(
      `export function main(): void {
  console.log('hello')
}
`,
      { target: 'c' }
    ).code,
    emitTargetFromIr('c', compiled.ir)
  )
})

test('runs C static checks as a separate pipeline helper', () => {
  const compiled = compileSourceToIr('const value: number = 1\n', { target: 'c' })

  assert.doesNotThrow(() => runCStaticChecks([compiled.ir]))
  assert.match(emitTargetFromIr('c', compiled.ir), /int main\(void\)/)
})

test('preserves function-typed object field return shapes through lowering', () => {
  const compiled = compileSourceToIr(
    `type State = { value: number }
type Deps = { make(): State }

function useDeps(deps: Deps): number {
  const state = deps.make()
  state.value = state.value + 1
  return state.value
}
`,
    { target: 'c' }
  )
  const declaration = compiled.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'useDeps')

  assert.ok(declaration)

  const stateDeclaration = declaration.body[0]
  const assignment = declaration.body[1].expression

  assert.equal(stateDeclaration.valueType, 'object')
  assert.equal(stateDeclaration.shape?.fields[0]?.name, 'value')
  assert.equal(stateDeclaration.init.shape?.fields[0]?.name, 'value')
  assert.equal(assignment.target.valueType, 'number')
  assert.equal(assignment.value.left.valueType, 'number')
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

    const compiled = await compileGraphToIrModules(entry, { target: 'c' })

    assert.equal(compiled.target, 'c')
    assert.deepEqual(
      compiled.irModules.map((module) => module.path),
      [dep, entry]
    )

    const result = await compileFile(entry, { target: 'c' })

    assert.deepEqual(
      result.graph.modules.map((module) => module.path),
      compiled.graph.modules.map((module) => module.path)
    )
    assert.match(result.code, /double value\(void\)/)
    assert.match(result.code, /void ccjs_main\(void\)/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
