export type NodeStdlibRuntimeImportKind = 'module-object'

export type NodeStdlibPackageDescriptor = {
  source: string
  libuvRuntimeFeature: string | null
}

export type NodeStdlibRuntimeImportDescriptor = {
  source: string
  kind: NodeStdlibRuntimeImportKind
  importedNames: string[]
}

export const nodeStdlibPackageDescriptors: NodeStdlibPackageDescriptor[] = []

export const nodeStdlibRuntimeImportDescriptors: NodeStdlibRuntimeImportDescriptor[] = []

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
