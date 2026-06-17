import { diagnostic, throwDiagnostics } from './diagnostics.ts'
import { collectIrFeatureRequirements, collectIrRuntimeRequirements } from './ir.ts'
import type { CompileOptions, Diagnostic, IrFeature, IrProgram, IrRuntimeRequirement } from './types.ts'

type RequiredRuntimeBudgets = {
  maxFeatures: number
  maxRuntimeRequirements: number
}

export function checkCCompileBudgets(programs: IrProgram[], options: CompileOptions): void {
  const budgets = options.budgets
  const diagnostics: Diagnostic[] = []

  if (budgets != null) {
    const features = collectIrFeatureRequirements(programs)
    const runtimeRequirements = collectIrRuntimeRequirements(programs)

    checkRequiredCCompileBudgets(features, runtimeRequirements, budgets as RequiredRuntimeBudgets, diagnostics)
  }

  throwDiagnostics(diagnostics)
}

function checkRequiredCCompileBudgets(
  features: IrFeature[],
  runtimeRequirements: IrRuntimeRequirement[],
  budgetLimits: RequiredRuntimeBudgets,
  diagnostics: Diagnostic[]
): void {
  const maxFeatures = budgetLimits.maxFeatures
  const maxRuntimeRequirements = budgetLimits.maxRuntimeRequirements

  if (exceedsFeatureBudget(features, maxFeatures)) {
    diagnostics.push(
      diagnostic(
        'CCJS_BUDGET',
        `C target uses ${features.length} IR features (${features.join(', ')}), exceeding maxFeatures budget ${maxFeatures}`
      )
    )
  }

  if (exceedsRuntimeBudget(runtimeRequirements, maxRuntimeRequirements)) {
    diagnostics.push(
      diagnostic(
        'CCJS_BUDGET',
        `C target uses ${runtimeRequirements.length} runtime requirements (${runtimeRequirements.join(', ')}), exceeding maxRuntimeRequirements budget ${maxRuntimeRequirements}`
      )
    )
  }
}

function exceedsFeatureBudget(
  items: IrFeature[],
  max: number | undefined
): boolean {
  if (max == null) {
    return false
  }

  return items.length > max
}

function exceedsRuntimeBudget(
  items: IrRuntimeRequirement[],
  max: number | undefined
): boolean {
  if (max == null) {
    return false
  }

  return items.length > max
}
