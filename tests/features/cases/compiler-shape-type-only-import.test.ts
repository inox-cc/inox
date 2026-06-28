// @targets cc
// @expect pass
// @stdout E_TYPE:2

import type { CompilerShapeDiagnostic } from './modules/compiler-shapes.ts'

function createDiagnostic(): CompilerShapeDiagnostic {
  return {
    code: 'E_TYPE',
    message: 'imported',
    path: ['root', 'child']
  }
}

const diagnostic = createDiagnostic()
console.log(`${diagnostic.code}:${diagnostic.path.length}`)
