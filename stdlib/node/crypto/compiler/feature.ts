import type { AnyNode, IrFeature } from '../../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../../compiler/features/types.ts'
import { nullableString } from '../../../../compiler/ir/node-utils.ts'

type CryptoFeatureNode = AnyNode & {
  cryptoRuntimeMethod?: string | null
  type?: string | null
}

export const cryptoFeature: CompilerFeatureDescriptor = {
  id: 'crypto',
  runtimeRequirements: ['binary', 'crypto', 'managed-values'],
  cPreludeIncludes: [],
  hasCPreludeHelpers: false
}

export function collectCryptoIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  const item = node as CryptoFeatureNode

  if (!cryptoRuntimeMethodName(item)) {
    return
  }

  features.add('crypto')
  features.add('runtime-values')
}

function cryptoRuntimeMethodName(expression: CryptoFeatureNode): string | null {
  const method = nullableString(expression.cryptoRuntimeMethod)

  if (expression.type !== 'CallExpression' || method === null || typeof method === 'undefined') {
    return null
  }

  return method
}
