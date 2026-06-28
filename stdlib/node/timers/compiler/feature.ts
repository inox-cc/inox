import { timerRuntimeMethodNameFromPath } from './descriptor.ts'
import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { nullableString, simpleReferencePath } from '../../../../compiler/features/runtime-backed/common.ts'
import type { RuntimeBackedFeatureNode } from '../../../../compiler/features/runtime-backed/common.ts'

export const timersFeature: CompilerFeatureDescriptor = {
  id: 'timers',
  runtimeRequirements: ['async-runtime', 'callback-values', 'managed-values', 'timers'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectTimersIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as RuntimeBackedFeatureNode

  if (!timerRuntimeCallName(item)) {
    return
  }

  features.add('timers')
}

function timerRuntimeCallName(expression: RuntimeBackedFeatureNode): string | null {
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
