// @targets cc
// @expect pass
// @stdout number

type BodyNode = {
  type: string
  valueType?: string | null
}

type ArrowNode = {
  type: string
  params?: string[] | null
  expressionBody?: boolean | null
  body?: BodyNode | null
  returnType?: string | null
}

function stringOrUnknown(value: string | null | undefined): string {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return 'unknown'
}

function stringOrNull(value: string | null | undefined): string | null {
  if (value !== null && typeof value !== 'undefined') {
    return value
  }

  return null
}

function functionTypeFromArrowFunctionExpression(expression: ArrowNode | null | undefined): string | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'ArrowFunctionExpression') {
    return null
  }

  const params: string[] = []
  let returnType = stringOrNull(expression.returnType)

  if (
    (returnType === null || typeof returnType === 'undefined') &&
    expression.expressionBody === true &&
    expression.body !== null &&
    typeof expression.body !== 'undefined'
  ) {
    returnType = stringOrNull(expression.body.valueType)

    if (returnType === null || typeof returnType === 'undefined') {
      if (expression.body.type === 'NumberLiteral') {
        returnType = 'number'
      }
    }
  }

  if (expression.params !== null && typeof expression.params !== 'undefined') {
    for (const param of expression.params) {
      params.push(param)
    }
  }

  return stringOrUnknown(returnType)
}

const expression: ArrowNode = {
  type: 'ArrowFunctionExpression',
  expressionBody: true,
  body: {
    type: 'NumberLiteral'
  }
}

console.log(functionTypeFromArrowFunctionExpression(expression))
