export function emitCConditionClause(expression: string): string {
  const trimmed = expression.trim()

  return isWrappedCExpression(trimmed) ? trimmed : `(${trimmed})`
}

export function emitCNegatedConditionClause(expression: string): string {
  return `(!${emitCConditionClause(expression)})`
}

function isWrappedCExpression(expression: string): boolean {
  if (!expression.startsWith('(') || !expression.endsWith(')')) {
    return false
  }

  let depth = 0

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index]

    if (char === '(') {
      depth += 1
    } else if (char === ')') {
      depth -= 1

      if (depth === 0 && index < expression.length - 1) {
        return false
      }
    }

    if (depth < 0) {
      return false
    }
  }

  return depth === 0
}
