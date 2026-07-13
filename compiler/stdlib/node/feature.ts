import type { AnyNode, IrFeature } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../../features/types.ts'
import { collectFsIrFeatures, fsFeature } from '../../../stdlib/node/fs/compiler/feature.ts'
import { collectTimersIrFeatures, timersFeature } from '../../../stdlib/node/timers/compiler/feature.ts'

export const nodeStdlibFeatures: CompilerFeatureDescriptor[] = [
  fsFeature,
  timersFeature
]

export function collectNodeStdlibIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  collectFsIrFeatures(node, features)
  collectTimersIrFeatures(node, features)
}

export function nodeStdlibFeatureChildNodes(node: AnyNode): AnyNode[] | null {
  return null
}
