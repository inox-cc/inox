import type { AnyNode, IrFeature } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../../features/types.ts'

export const nodeStdlibFeatures: CompilerFeatureDescriptor[] = []

export function collectNodeStdlibIrFeatures(_node: AnyNode, _features: Set<IrFeature>): void {}

export function nodeStdlibFeatureChildNodes(node: AnyNode): AnyNode[] | null {
  return null
}
