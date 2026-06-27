import type { AnyNode, IrFeature } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../types.ts'
import { nullableString } from './common.ts'
import type { RuntimeBackedFeatureNode } from './common.ts'

export const cryptoFeature: CompilerFeatureDescriptor = {
  id: 'crypto',
  runtimeRequirements: ['binary', 'crypto', 'managed-values'],
  cPreludeIncludes: [],
  cPreludeHelpers: [],
  collect: collectCryptoIrFeatures
}

export function collectCryptoIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as RuntimeBackedFeatureNode

  if (!cryptoRuntimeMethodName(item)) {
    return
  }

  features.add('crypto')
  features.add('runtime-values')
}

function cryptoRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const method = nullableString(expression.cryptoRuntimeMethod)

  if (expression.type !== 'CallExpression' || method === null || typeof method === 'undefined') {
    return null
  }

  return method
}
