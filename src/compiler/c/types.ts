import type { AnyNode, IrProgram, ModuleRecord, RandomOptions } from '../types.ts'
import type { CompilerHost } from '../host.ts'

export type CEmitOptions = {
  random?: RandomOptions
}

export type CPreparedExpression = {
  lines: string[]
  expression: string
  nullable?: boolean
  rejectionValueType?: string
  valueType?: string
}

export type CPreparedStatement = {
  lines: string[]
}

export type CPreparedStringBytesOperand = {
  lines: string[]
  bytes: string
  length: string
}

export type CPreparedCallArgs = {
  lines: string[]
  args: string[]
}

export type CModuleOutputFile = {
  kind: 'header' | 'source'
  path: string
  sourcePath: string
  code: string
}

export type CModuleEmitOptions = CEmitOptions & {
  host: CompilerHost
  sourceRoot?: string
}

export type CModulePlan = {
  record: ModuleRecord
  ir: IrProgram
  isEntry: boolean
  relativeSourcePath: string
  sourcePath: string
  headerPath: string
  symbolPrefix: string
  headerGuard: string
  initName: string | null
  imports: CModuleImportPlan[]
}

export type CModuleImportPlan = {
  declaration: AnyNode
  module: CModulePlan
}
