export type ImportedAnyNode = {
  [key: string]: unknown
  type?: string
}

export type ImportedModuleRecord = {
  exports: Map<string, ImportedAnyNode>
}
