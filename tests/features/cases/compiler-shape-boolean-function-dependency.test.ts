// @targets cc
// @expect pass
// @stdout runtime

type Expression = {
  value: string | null
}

type EmitContext = {
  phase: string
}

type EmitDependencies = {
  isRuntimeStringReference: (expression: Expression, context: EmitContext) => boolean
}

function resolveRuntimeStringReference(expression: Expression, _context: EmitContext): string | null {
  return expression.value
}

function isRuntimeStringReference(expression: Expression, context: EmitContext): boolean {
  return resolveRuntimeStringReference(expression, context) !== null
}

function classify(expression: Expression, context: EmitContext, dependencies: EmitDependencies): string {
  return dependencies.isRuntimeStringReference(expression, context) ? context.phase : 'raw'
}

const dependencies: EmitDependencies = {
  isRuntimeStringReference
}

console.log(classify({ value: 'name' }, { phase: 'runtime' }, dependencies))
