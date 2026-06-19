import { collectIrFunctionEffects } from './ir/effects.ts'
import { collectIrFeatures, collectRuntimeRequirements, collectSyntaxFeatureUsages } from './ir/features.ts'
import { collectGlobalUsages } from './ir/globals.ts'
import { collectFunctionDeclarations, collectTopLevelItems } from './ir/top-level.ts'
import type { IrProgram, ProgramNode } from './types.ts'

export {
  collectIrFunctionEffects,
  collectIrFunctionEffectsWithExternalEffects,
  collectIrLocalThrowValueTypes,
  collectIrStoredFunctionEffects,
  irClassMethodEffectName,
  mergeIrFunctionEffects
} from './ir/effects.ts'
export {
  collectIrFeatureRequirements,
  collectIrRuntimeRequirements,
  collectIrSyntaxFeatureUsages
} from './ir/features.ts'
export { collectIrGlobalRoots, collectIrGlobalUsages } from './ir/globals.ts'
export {
  collectIrFunctionDeclarations,
  collectIrFunctionNodeEntries,
  collectIrModuleRecords,
  collectIrPrograms,
  collectIrTopLevelNodeEntries,
  collectIrTopLevelNodes,
  collectIrTopLevelNodesFromPrograms,
  findIrEntryProgram,
  hasIrFunctionDeclaration
} from './ir/top-level.ts'
export type { IrFunctionNodeEntry, IrModuleRecord } from './ir/top-level.ts'

export function lowerHirToIr(program: ProgramNode): IrProgram {
  const features = collectIrFeatures(program)
  const topLevelItems = collectTopLevelItems(program)

  return {
    type: 'IrProgram',
    version: 1,
    features,
    runtimeRequirements: collectRuntimeRequirements(features),
    topLevelItems,
    functionDeclarations: collectFunctionDeclarations(program, topLevelItems),
    functionEffects: collectIrFunctionEffects([{ body: program.body, topLevelItems }]),
    syntaxFeatures: collectSyntaxFeatureUsages(program),
    globalUsages: collectGlobalUsages(program),
    body: program.body
  }
}
