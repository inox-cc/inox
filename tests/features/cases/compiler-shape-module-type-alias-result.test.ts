// @targets c
// @expect pass
// @stdout INOX_MODULE 2

import type { CompilerShapeDiagnostic } from './modules/compiler-shapes.ts'

function firstDiagnostic(diagnostics: CompilerShapeDiagnostic[]): CompilerShapeDiagnostic {
  return diagnostics[0]
}

const diagnostic = firstDiagnostic([
  {
    code: 'INOX_MODULE',
    message: 'resolved',
    path: ['graph', 'emit']
  }
])

console.log(`${diagnostic.code} ${diagnostic.path.length}`)
