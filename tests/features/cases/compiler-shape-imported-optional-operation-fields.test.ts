// @targets cc
// @expect pass
// @stdout 0
// @stdout string

import type { CompilerShapeOperation } from './modules/compiler-shape-operation-context.d.ts'

function describeOperation(operation: CompilerShapeOperation): void {
  const minArgs = operation.minArgs
  const checks = operation.checks ?? []

  if (checks.length === 0) {
    return
  }

  const fieldValueType = checks[0].objectFieldValueType

  if (fieldValueType === null || typeof fieldValueType === 'undefined') {
    return
  }

  console.log(`${minArgs ?? 0}`)
  console.log(fieldValueType)
}

describeOperation({
  minArgs: null,
  checks: [{ objectFieldValueType: 'string' }]
})
