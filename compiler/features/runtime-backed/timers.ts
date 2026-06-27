import { timerRuntimeMethodNameFromPath } from '../../stdlib/descriptors/timers.ts'
import type { AnyNode, IrFeature } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../types.ts'
import { nullableString, simpleReferencePath } from './common.ts'
import type { RuntimeBackedFeatureNode } from './common.ts'

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
