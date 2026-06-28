import type { AnyNode, IrFeature } from '../../types.ts'
import type { CompilerFeatureDescriptor } from '../../features/types.ts'
import { binaryFeature, binaryFeatureChildNodes, collectBinaryIrFeatures } from '../../../stdlib/node/buffer/compiler/feature.ts'
import { childProcessFeature, collectChildProcessIrFeatures } from '../../../stdlib/node/child_process/compiler/feature.ts'
import { collectCryptoIrFeatures, cryptoFeature } from '../../../stdlib/node/crypto/compiler/feature.ts'
import { collectFsIrFeatures, fsFeature } from '../../../stdlib/node/fs/compiler/feature.ts'
import { collectOsIrFeatures, osFeature } from '../../../stdlib/node/os/compiler/feature.ts'
import { collectPathIrFeatures, pathFeature } from '../../../stdlib/node/path/compiler/feature.ts'
import { collectProcessIrFeatures, processFeature } from '../../../stdlib/node/process/compiler/feature.ts'
import { collectTimersIrFeatures, timersFeature } from '../../../stdlib/node/timers/compiler/feature.ts'
import { collectUrlIrFeatures, urlFeature } from '../../../stdlib/node/url/compiler/feature.ts'

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
