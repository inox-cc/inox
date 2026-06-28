import type { AnyNode, IrFeature } from '../../../compiler/types.ts'
import type { CompilerFeatureDescriptor } from '../../../compiler/features/types.ts'
import { binaryFeature, binaryFeatureChildNodes, collectBinaryIrFeatures } from '../buffer/compiler/feature.ts'
import { childProcessFeature, collectChildProcessIrFeatures } from '../child_process/compiler/feature.ts'
import { collectCryptoIrFeatures, cryptoFeature } from '../crypto/compiler/feature.ts'
import { collectFsIrFeatures, fsFeature } from '../fs/compiler/feature.ts'
import { collectOsIrFeatures, osFeature } from '../os/compiler/feature.ts'
import { collectPathIrFeatures, pathFeature } from '../path/compiler/feature.ts'
import { collectProcessIrFeatures, processFeature } from '../process/compiler/feature.ts'
import { collectTimersIrFeatures, timersFeature } from '../timers/compiler/feature.ts'
import { collectUrlIrFeatures, urlFeature } from '../url/compiler/feature.ts'

export const nodeStdlibFeatures: CompilerFeatureDescriptor[] = [
  binaryFeature,
  childProcessFeature,
  cryptoFeature,
  fsFeature,
  osFeature,
  pathFeature,
  processFeature,
  timersFeature,
  urlFeature
]

export function collectNodeStdlibIrFeatures(node: AnyNode, features: Set<IrFeature>): void {
  collectBinaryIrFeatures(node, features)
  collectChildProcessIrFeatures(node, features)
  collectCryptoIrFeatures(node, features)
  collectFsIrFeatures(node, features)
  collectOsIrFeatures(node, features)
  collectPathIrFeatures(node, features)
  collectProcessIrFeatures(node, features)
  collectTimersIrFeatures(node, features)
  collectUrlIrFeatures(node, features)
}

export function nodeStdlibFeatureChildNodes(node: AnyNode): AnyNode[] | null {
  return binaryFeatureChildNodes(node)
}
