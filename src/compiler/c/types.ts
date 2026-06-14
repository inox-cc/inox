import type { AnyNode, IrProgram, ModuleRecord, RandomOptions } from '../types.ts'

export type CEmitOptions = {
  random?: RandomOptions
}

export type CModuleOutputFile = {
  kind: 'header' | 'source'
  path: string
  sourcePath: string
  code: string
}

export type CModuleEmitOptions = CEmitOptions & {
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
