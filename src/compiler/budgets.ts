import { CompileError, diagnostic } from './diagnostics.ts'
import { collectIrFeatureRequirements, collectIrRuntimeRequirements } from './ir.ts'
import type { CompileOptions, Diagnostic, IrFeature, IrProgram, IrRuntimeRequirement } from './types.ts'

export function checkCCompileBudgets(programs: IrProgram[], options: CompileOptions): void {
  if (options.budgets == null) {
    return
  }

  const diagnostics: Diagnostic[] = []
  const features = collectIrFeatureRequirements(programs)
  const runtimeRequirements = collectIrRuntimeRequirements(programs)

  if (exceedsBudget(features, options.budgets.maxFeatures)) {
    diagnostics.push(
      diagnostic(
        'CCJS_BUDGET',
        `C target uses ${features.length} IR features (${features.join(', ')}), exceeding maxFeatures budget ${options.budgets.maxFeatures}`
      )
    )
  }

  if (exceedsBudget(runtimeRequirements, options.budgets.maxRuntimeRequirements)) {
    diagnostics.push(
      diagnostic(
        'CCJS_BUDGET',
        `C target uses ${runtimeRequirements.length} runtime requirements (${runtimeRequirements.join(', ')}), exceeding maxRuntimeRequirements budget ${options.budgets.maxRuntimeRequirements}`
      )
    )
  }

  if (diagnostics.length > 0) {
    throw new CompileError(diagnostics)
  }
}

function exceedsBudget(
  items: readonly IrFeature[] | readonly IrRuntimeRequirement[],
  max: number | undefined
): boolean {
  return max != null && items.length > max
}
