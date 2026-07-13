import type { AnyNode, IrFeature } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../../features/types.ts'
import { collectTimersIrFeatures, timersFeature } from '../../../stdlib/node/timers/compiler/feature.ts'

export const nodeStdlibFeatures: CompilerFeatureDescriptor[] = [
  timersFeature
]

export function collectNodeStdlibIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  collectTimersIrFeatures(node, features)
}

export function nodeStdlibFeatureChildNodes(node: AnyNode): AnyNode[] | null {
  return null
}
