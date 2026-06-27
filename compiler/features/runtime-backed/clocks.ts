import { memberExpressionPath } from '../../member-paths.ts'
import {
  dateConstructorRuntimeMethodNameFromPath,
  dateInstanceRuntimeMethodName,
  dateInstanceRuntimeMethodReturnType,
  timeRuntimeMethodNameFromPath
} from '../../stdlib/descriptors/time.ts'
import type { AnyNode, IrFeature } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../types.ts'
import { isCallLikeNode, nullableString } from './common.ts'
import type { RuntimeBackedFeatureNode } from './common.ts'

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
