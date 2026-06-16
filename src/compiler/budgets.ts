import { diagnostic, throwDiagnostics } from './diagnostics.ts'
import { collectIrFeatureRequirements, collectIrRuntimeRequirements } from './ir.ts'
import type { CompileOptions, Diagnostic, IrFeature, IrProgram, IrRuntimeRequirement } from './types.ts'

export function checkCCompileBudgets(programs: IrProgram[], options: CompileOptions): void {
  const budgets = options.budgets
  const diagnostics: Diagnostic[] = []

  if (budgets != null) {
    const features = collectIrFeatureRequirements(programs)
    const runtimeRequirements = collectIrRuntimeRequirements(programs)

    if (budgets.maxFeatures != null) {
      const maxFeatures = budgets.maxFeatures

      if (exceedsBudget(features, maxFeatures)) {
        diagnostics.push(
          diagnostic(
            'CCJS_BUDGET',
            `C target uses ${features.length} IR features (${features.join(', ')}), exceeding maxFeatures budget ${maxFeatures}`
          )
        )
      }
    }

    if (budgets.maxRuntimeRequirements != null) {
      const maxRuntimeRequirements = budgets.maxRuntimeRequirements

      if (exceedsBudget(runtimeRequirements, maxRuntimeRequirements)) {
        diagnostics.push(
          diagnostic(
            'CCJS_BUDGET',
            `C target uses ${runtimeRequirements.length} runtime requirements (${runtimeRequirements.join(', ')}), exceeding maxRuntimeRequirements budget ${maxRuntimeRequirements}`
          )
        )
      }
    }
  }

  throwDiagnostics(diagnostics)
}

function exceedsBudget(
  items: IrFeature[] | IrRuntimeRequirement[],
  max: number | undefined
): boolean {
  if (max == null) {
    return false
  }

  return items.length > max
}
