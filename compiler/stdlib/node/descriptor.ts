import {
  nodeBufferImportSource,
  nodeBufferModuleObjectImportNames
} from '../../../stdlib/node/buffer/compiler/descriptor.ts'
import {
  nodeChildProcessImportSource,
  nodeChildProcessModuleObjectImportNames
} from '../../../stdlib/node/child_process/compiler/descriptor.ts'
import {
  nodeCryptoImportSource,
  nodeCryptoModuleObjectImportNames
} from '../../../stdlib/node/crypto/compiler/descriptor.ts'
import {
  nodeDgramCreateSocketImportNames,
  nodeDgramImportSource,
  nodeDgramModuleObjectImportNames
} from '../../../stdlib/node/dgram/compiler/descriptor.ts'
import {
  nodeEventsImportSource,
  nodeEventsModuleObjectImportNames
} from '../../../stdlib/node/events/compiler/descriptor.ts'
import { nodeFsImportSource } from '../../../stdlib/node/fs/compiler/descriptor.ts'
import { nodeFsPromisesImportSource } from '../../../stdlib/node/fs/promises/compiler/descriptor.ts'
import {
  nodeHttpCreateServerImportNames,
  nodeHttpImportSource,
  nodeHttpModuleObjectImportNames
} from '../../../stdlib/node/http/compiler/descriptor.ts'
import {
  nodeNetConnectImportNames,
  nodeNetCreateServerImportNames,
  nodeNetImportSource,
  nodeNetModuleObjectImportNames
} from '../../../stdlib/node/net/compiler/descriptor.ts'
import {
  nodeProcessImportSource,
  nodeProcessModuleObjectImportNames
} from '../../../stdlib/node/process/compiler/descriptor.ts'
import {
  nodeStreamImportSource,
  nodeStreamModuleObjectImportNames
} from '../../../stdlib/node/stream/compiler/descriptor.ts'
import {
  nodeTimersImportSource,
  nodeTimersModuleObjectImportNames
} from '../../../stdlib/node/timers/compiler/descriptor.ts'

export { isBinaryGlobalUsagePath } from '../../../stdlib/node/buffer/compiler/descriptor.ts'
export { isCryptoRuntimeMethodPath } from '../../../stdlib/node/crypto/compiler/descriptor.ts'
export { fsGlobalUsagePathForRuntimeMethod } from '../../../stdlib/node/fs/compiler/descriptor.ts'
export {
  isTimerRuntimeMethod,
  timerRuntimeMethodNameFromPath
} from '../../../stdlib/node/timers/compiler/descriptor.ts'

export type NodeStdlibRuntimeImportKind =
  | 'connect'
  | 'create-server'
  | 'create-socket'
  | 'module-object'

export type NodeStdlibPackageDescriptor = {
  source: string
  libuvRuntimeFeature: string | null
}

export type NodeStdlibRuntimeImportDescriptor = {
  source: string
  kind: NodeStdlibRuntimeImportKind
  importedNames: string[]
}

export const nodeStdlibPackageDescriptors: NodeStdlibPackageDescriptor[] = [
  {
    source: nodeBufferImportSource,
    libuvRuntimeFeature: null
  },
  {
    source: nodeCryptoImportSource,
    libuvRuntimeFeature: 'node:crypto'
  },
  {
    source: nodeChildProcessImportSource,
    libuvRuntimeFeature: null
  },
  {
    source: nodeDgramImportSource,
    libuvRuntimeFeature: 'node:dgram'
  },
  {
    source: nodeEventsImportSource,
    libuvRuntimeFeature: null
  },
  {
    source: nodeFsImportSource,
    libuvRuntimeFeature: null
  },
  {
    source: nodeFsPromisesImportSource,
    libuvRuntimeFeature: null
  },
  {
    source: nodeHttpImportSource,
    libuvRuntimeFeature: 'node:http'
  },
  {
    source: nodeNetImportSource,
    libuvRuntimeFeature: 'node:net'
  },
  {
    source: nodeStreamImportSource,
    libuvRuntimeFeature: null
  },
  {
    source: nodeTimersImportSource,
    libuvRuntimeFeature: null
  },
  {
    source: nodeProcessImportSource,
    libuvRuntimeFeature: null
  }
]

export const nodeStdlibRuntimeImportDescriptors: NodeStdlibRuntimeImportDescriptor[] = [
  {
    source: nodeBufferImportSource,
    kind: 'module-object',
    importedNames: nodeBufferModuleObjectImportNames
  },
  {
    source: nodeChildProcessImportSource,
    kind: 'module-object',
    importedNames: nodeChildProcessModuleObjectImportNames
  },
  {
    source: nodeDgramImportSource,
    kind: 'module-object',
    importedNames: nodeDgramModuleObjectImportNames
  },
  {
    source: nodeDgramImportSource,
    kind: 'create-socket',
    importedNames: nodeDgramCreateSocketImportNames
  },
  {
    source: nodeCryptoImportSource,
    kind: 'module-object',
    importedNames: nodeCryptoModuleObjectImportNames
  },
  {
    source: nodeEventsImportSource,
    kind: 'module-object',
    importedNames: nodeEventsModuleObjectImportNames
  },
  {
    source: nodeHttpImportSource,
    kind: 'module-object',
    importedNames: nodeHttpModuleObjectImportNames
  },
  {
    source: nodeHttpImportSource,
    kind: 'create-server',
    importedNames: nodeHttpCreateServerImportNames
  },
  {
    source: nodeNetImportSource,
    kind: 'module-object',
    importedNames: nodeNetModuleObjectImportNames
  },
  {
    source: nodeNetImportSource,
    kind: 'create-server',
    importedNames: nodeNetCreateServerImportNames
  },
  {
    source: nodeNetImportSource,
    kind: 'connect',
    importedNames: nodeNetConnectImportNames
  },
  {
    source: nodeProcessImportSource,
    kind: 'module-object',
    importedNames: nodeProcessModuleObjectImportNames
  },
  {
    source: nodeStreamImportSource,
    kind: 'module-object',
    importedNames: nodeStreamModuleObjectImportNames
  },
  {
    source: nodeTimersImportSource,
    kind: 'module-object',
    importedNames: nodeTimersModuleObjectImportNames
  },
]

export function nodeStdlibPackageDescriptorCount(): number {
  return nodeStdlibPackageDescriptors.length
}

export function nodeStdlibPackageDescriptorAt(index: number): NodeStdlibPackageDescriptor {
  return nodeStdlibPackageDescriptors[index]
}

export function nodeStdlibRuntimeImportDescriptorCount(): number {
  return nodeStdlibRuntimeImportDescriptors.length
}

export function nodeStdlibRuntimeImportDescriptorAt(index: number): NodeStdlibRuntimeImportDescriptor {
  return nodeStdlibRuntimeImportDescriptors[index]
}

export function isNodeStdlibRuntimeImportBinding(
  source: string | null | undefined,
  id: string,
  kind: NodeStdlibRuntimeImportKind,
  importedName: string | null | undefined
): boolean {
  return isNodeStdlibImportSourceForId(source, id) && isNodeStdlibRuntimeImportName(id, kind, importedName)
}

export function isNodeStdlibRuntimeImportName(
  id: string,
  kind: NodeStdlibRuntimeImportKind,
  importedName: string | null | undefined
): boolean {
  if (importedName === null || typeof importedName === 'undefined') {
    return false
  }

  for (let index = 0; index < nodeStdlibRuntimeImportDescriptorCount(); index = index + 1) {
    const descriptor = nodeStdlibRuntimeImportDescriptorAt(index)

    if (nodeStdlibModuleIdFromImportSource(descriptor.source) !== id || descriptor.kind !== kind) {
      continue
    }

    for (let nameIndex = 0; nameIndex < descriptor.importedNames.length; nameIndex = nameIndex + 1) {
      if (descriptor.importedNames[nameIndex] === importedName) {
        return true
      }
    }
  }

  return false
}

function isNodeStdlibImportSourceForId(source: string | null | undefined, id: string): boolean {
  if (source === null || typeof source === 'undefined') {
    return false
  }

  return findNodeStdlibPackageDescriptor(source) !== null && nodeStdlibModuleIdFromImportSource(source) === id
}

function findNodeStdlibPackageDescriptor(source: string): NodeStdlibPackageDescriptor | null {
  for (let index = 0; index < nodeStdlibPackageDescriptorCount(); index = index + 1) {
    const descriptor = nodeStdlibPackageDescriptorAt(index)

    if (descriptor.source === source) {
      return descriptor
    }
  }

  return null
}

function nodeStdlibModuleIdFromImportSource(source: string): string {
  const prefixLength = 'node:'.length
  let id = ''

  for (let index = prefixLength; index < source.length; index = index + 1) {
    const sourceChar = source.slice(index, index + 1)

    if (sourceChar === '/' || sourceChar === '_') {
      id = `${id}-`
    } else {
      id = `${id}${sourceChar}`
    }
  }

  return id
}
