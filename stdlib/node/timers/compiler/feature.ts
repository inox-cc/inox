import { timerRuntimeMethodNameFromPath } from './descriptor.ts'
import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { nullableString, simpleReferencePath } from '../../../../compiler/ir/node-utils.ts'

type TimersFeatureNode = AnyNode & {
  callee?: AnyNode | null
  timerRuntimeMethod?: string | null
  type?: string | null
}

export const timersFeature: CompilerFeatureDescriptor = {
  id: 'timers',
  runtimeRequirements: ['async-runtime', 'callback-values', 'managed-values', 'timers'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectTimersIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as TimersFeatureNode

  if (!timerRuntimeCallName(item)) {
    return
  }

  features.add('timers')
}

function timerRuntimeCallName(expression: TimersFeatureNode): string | null {
  const method = nullableString(expression.timerRuntimeMethod)

  if (expression.type === 'CallExpression' && method !== null && typeof method !== 'undefined') {
    return method
  }

  const calleePath = simpleReferencePath(expression.callee)

  if (calleePath === null || typeof calleePath === 'undefined') {
    return null
  }

  return timerRuntimeMethodNameFromPath(calleePath)
}
