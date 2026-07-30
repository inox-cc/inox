// @targets cc
// @expect pass
// @stdout 0 string

type Check = {
  objectFieldValueType?: string | null
}

type Operation = {
  minArgs?: number | null
  checks?: Check[]
}

function describe(operation: Operation): void {
  const minArgs = operation.minArgs
  const checks = operation.checks ?? []

  if (checks.length === 0) {
    return
  }

  const fieldValueType = checks[0].objectFieldValueType

  if (fieldValueType === null || typeof fieldValueType === 'undefined') {
    return
  }

  console.log(minArgs ?? 0, fieldValueType)
}

describe({ checks: [{ objectFieldValueType: 'string' }] })
