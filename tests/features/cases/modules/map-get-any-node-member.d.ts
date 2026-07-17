import type {
  ImportedAnyNode,
  ImportedModuleRecord
} from './map-get-any-node-member-base.d.ts'

export type ImportedModuleNode = ImportedAnyNode

export type ImportedModulePlan = {
  record: ImportedModuleRecord
}

export type ImportedModuleImportPlan = {
  module?: ImportedModulePlan | null
}
