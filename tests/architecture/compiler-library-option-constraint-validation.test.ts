import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompilerLibrarySet } from '../../compiler/extensions/library-set-builder.ts'
import type {
  CompilerLibraryDescriptor,
  LibraryOptionConstraintDescriptor,
  LibraryOptionDescriptor
} from '../../compiler/extensions/types.ts'

const libraryId = 'fixture:target-options'
const optionId = `${libraryId}#mode`

test('library option constraints валидируют provider, scalar type и duplicate values', () => {
  assert.throws(
    () => createCompilerLibrarySet([fixture([], constraint(['native']))]),
    /runtime requirement fixture:target-options#runtime references missing option fixture:target-options#mode/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixture([option()], constraint([1]))]),
    /constraint value 1 expects string/
  )
  assert.throws(
    () => createCompilerLibrarySet([fixture([option()], constraint(['native', 'native']))]),
    /duplicate constraint value native/
  )
})

function fixture(
  options: LibraryOptionDescriptor[],
  optionConstraint: LibraryOptionConstraintDescriptor
): CompilerLibraryDescriptor {
  return {
    id: libraryId,
    dependencies: [],
    declarations: [],
    options,
    operations: [],
    intrinsicBindings: [],
    runtimeRequirements: [
      {
        id: `${libraryId}#runtime`,
        dependencies: [],
        cPreludeIncludes: [],
        capabilities: [],
        optionConstraints: [optionConstraint]
      }
    ]
  }
}

function option(): LibraryOptionDescriptor {
  return {
    libraryId,
    optionId,
    cliAliases: [],
    valueType: 'string',
    defaultValue: 'portable',
    allowedValues: ['portable', 'native']
  }
}

function constraint(allowedValues: Array<string | number>): LibraryOptionConstraintDescriptor {
  return {
    optionId,
    allowedValues,
    diagnosticCode: 'FIXTURE_TARGET_OPTION',
    diagnosticMessage: 'unsupported target option'
  }
}
