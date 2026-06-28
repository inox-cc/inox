import { memberExpressionPath } from '../../../../compiler/member-paths.ts'
import {
  dateConstructorRuntimeMethodNameFromPath,
  dateInstanceRuntimeMethodName,
  dateInstanceRuntimeMethodReturnType,
  timeRuntimeMethodNameFromPath
} from './descriptor.ts'
import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { isCallLikeNode, nullableString } from '../../../../compiler/features/runtime-backed/common.ts'
import type { RuntimeBackedFeatureNode } from '../../../../compiler/features/runtime-backed/common.ts'

export const clocksFeature: CompilerFeatureDescriptor = {
  id: 'clocks',
  runtimeRequirements: ['clocks'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectClocksIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as RuntimeBackedFeatureNode

  if (!isCallLikeNode(item)) {
    return
  }

  const call = clocksRuntimeCallName(item)

  if (call === null || typeof call === 'undefined') {
    return
  }

  features.add('clocks')

  if (dateInstanceRuntimeMethodReturnType(call) === 'string') {
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (call === 'sleep') {
    features.add('runtime-values')
  }
}

function clocksRuntimeCallName(expression: RuntimeBackedFeatureNode): string | null {
  const directCall = nullableString(expression.timeRuntimeMethod)
  const callee = expression.callee

  if (directCall !== null && typeof directCall !== 'undefined') {
    return directCall
  }

  if (callee === null || typeof callee === 'undefined') {
    return null
  }

  const timeCall = timeRuntimeCallName(callee)

  if (timeCall !== null && typeof timeCall !== 'undefined') {
    return timeCall
  }

  return dateReceiverRuntimeMethodName(callee)
}

function timeRuntimeCallName(callee: AnyNode): string | null {
  const path = memberExpressionPath(callee)
  const method = timeRuntimeMethodNameFromPath(path)

  if (method !== null && typeof method !== 'undefined') {
    return method
  }

  return dateConstructorRuntimeMethodNameFromPath(path)
}

function dateReceiverRuntimeMethodName(callee: AnyNode): string | null {
  if (callee.type !== 'MemberExpression') {
    return null
  }

  const receiver = callee.object

  if (receiver === null || typeof receiver === 'undefined' || receiver.valueType !== 'date') {
    return null
  }

  return dateInstanceRuntimeMethodName(callee.property)
}
