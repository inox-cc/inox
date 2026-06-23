export type CompilerAnyNode = { [key: string]: any }

export type CompilerStatementNode = CompilerAnyNode

export type CompilerObjectShapeInfo = {
  kind: 'object'
  baseTypes?: string[]
  dynamic?: boolean
  dynamicField?: CompilerAnyNode | null
  fields: CompilerAnyNode[]
  [key: string]: any
}

export type CompilerFieldMetadata = {
  name: string
  optional?: boolean
  ownership?: string
  valueType: string
  [key: string]: any
}
