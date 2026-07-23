import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('C++ contexts сохраняют dependency shape через generic boundary', () => {
  const contextSource = readFileSync(new URL('../../compiler/backends/cpp/context.ts', import.meta.url), 'utf8')
  const declarationsSource = readFileSync(new URL('../../compiler/backends/cpp/declarations.ts', import.meta.url), 'utf8')
  const indexSource = readFileSync(new URL('../../compiler/backends/cpp/index.ts', import.meta.url), 'utf8')
  const unitSource = readFileSync(new URL('../../compiler/backends/cpp/unit.ts', import.meta.url), 'utf8')

  assert.match(contextSource, /export type CEmitContextWithDependencies</)
  assert.match(contextSource, /asyncTaskLoweringDependencies: AsyncTaskDependencies/)
  assert.match(contextSource, /classLoweringDependencies: ClassDependencies/)
  assert.match(contextSource, /nullableLoweringDependencies: NullableDependencies/)
  assert.match(contextSource, /statementLoweringDependencies: StatementDependencies/)
  assert.match(contextSource, /stringLoweringDependencies: StringDependencies/)
  assert.match(contextSource, /CFunctionContextWithDependencies</)
  assert.match(indexSource, /type CFunctionContext = CFunctionContextWithDependencies</)
  assert.match(indexSource, /AsyncTaskLoweringDependencies,/)
  assert.match(indexSource, /StatementLoweringDependencies,/)
  assert.match(indexSource, /const cUnitDependencies: CUnitDependencies =/)
  assert.match(declarationsSource, /export function emitClassConstructorDeclaration\(/)
  assert.match(unitSource, /emitClassConstructorDeclaration\(classInfo, baseContext, deps\.declarationEmissionDependencies\)/)
  assert.doesNotMatch(unitSource, /emitClassConstructorDeclaration:/)
  assert.doesNotMatch(unitSource, /emitClassMethodDeclaration:/)
  assert.doesNotMatch(unitSource, /emitFunctionDeclaration:/)
  assert.doesNotMatch(unitSource, /emitMainWrapper:/)
  assert.doesNotMatch(contextSource, /ArrayDependencies|arrayLoweringDependencies/)
  assert.doesNotMatch(indexSource, /ArrayLoweringDependencies|arrayLoweringDependencies/)
  assert.doesNotMatch(contextSource, /CLoweringDependencies/)
  assert.doesNotMatch(indexSource, /CLoweringDependencies/)
})
