// @targets cc
// @expect pass
// @stdout 1

import type {
  ImportedModuleNode as ModuleNode,
  ImportedModuleImportPlan as ModuleImportPlan,
  ImportedModulePlan as ModulePlan
} from './modules/map-get-any-node-member.d.ts'
import type { ImportedAnyNode as AnyNode } from './modules/map-get-any-node-member-base.d.ts'

function hasImportedValue(item: ModuleImportPlan, specifier: ModuleNode): boolean {
  const module = item.module

  if (module === null || typeof module === 'undefined') {
    return false
  }

  const value = module.record.exports.get(specifier.imported)
  return value !== null && typeof value !== 'undefined'
}

const exports = new Map<string, AnyNode>()
exports.set('item', { value: 'value' })
const module: ModulePlan = { record: { exports } }
console.log(hasImportedValue({ module }, { imported: 'item' }))
