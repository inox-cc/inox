import { typeRefIsAssignable, typeRefTraits } from './type-ref-compatibility.ts'
import type { CompilerLibrarySet, ConcreteTypeRef, ObjectTypeRefField, TypeRef } from './types.ts'
import type { TypeRefSubstitution } from './type-ref-substitution.ts'

export type TypeRefInferenceResult = {
  substitutions: TypeRefSubstitution[]
  conflicts: string[]
  unresolved: string[]
}

/** Infers data-only TypeRef parameters without knowledge of declaration or stdlib names. */
export function inferTypeRefSubstitutions(
  templates: TypeRef[],
  actuals: TypeRef[],
  parameterNames: string[],
  libraries: CompilerLibrarySet
): TypeRefInferenceResult {
  const substitutions: TypeRefSubstitution[] = []
  const conflicts: string[] = []

  for (let index = 0; index < templates.length && index < actuals.length; index = index + 1) {
    inferTypeRefSubstitution(templates[index], actuals[index], parameterNames, substitutions, conflicts, libraries)
  }

  const unresolved: string[] = []

  for (let index = 0; index < parameterNames.length; index = index + 1) {
    const name = parameterNames[index]

    if (typeRefSubstitutionForName(substitutions, name) === null) {
      unresolved.push(name)
    }
  }

  return { substitutions, conflicts, unresolved }
}

function inferTypeRefSubstitution(
  template: TypeRef,
  actual: TypeRef,
  parameterNames: string[],
  substitutions: TypeRefSubstitution[],
  conflicts: string[],
  libraries: CompilerLibrarySet
): void {
  if (template.kind === 'parameter') {
    if (parameterNames.includes(template.name)) {
      recordTypeRefSubstitution(template.name, actual, substitutions, conflicts, libraries)
    }

    return
  }

  if (actual.kind === 'parameter' || actual.kind === 'unknown') {
    return
  }

  if (template.kind === 'nominal' && actual.kind === 'nominal' && template.typeId === actual.typeId) {
    inferTypeRefListSubstitutions(
      template.args,
      actual.args,
      parameterNames,
      substitutions,
      conflicts,
      libraries
    )
    inferTypeRefTraitSubstitutions(
      template,
      actual,
      parameterNames,
      substitutions,
      conflicts,
      libraries
    )
    return
  }

  if (template.kind === 'function' && actual.kind === 'function') {
    inferTypeRefListSubstitutions(
      template.params,
      actual.params,
      parameterNames,
      substitutions,
      conflicts,
      libraries
    )
    inferTypeRefSubstitution(
      template.result,
      actual.result,
      parameterNames,
      substitutions,
      conflicts,
      libraries
    )
    inferTypeRefTraitSubstitutions(
      template,
      actual,
      parameterNames,
      substitutions,
      conflicts,
      libraries
    )
    return
  }

  if (template.kind === 'object' && actual.kind === 'object') {
    for (let index = 0; index < template.fields.length; index = index + 1) {
      const templateField = template.fields[index]
      const actualField = objectTypeRefField(actual.fields, templateField.name)

      if (actualField !== null) {
        inferTypeRefSubstitution(
          templateField.typeRef,
          actualField.typeRef,
          parameterNames,
          substitutions,
          conflicts,
          libraries
        )
      }
    }

    if (
      template.dynamicField !== null &&
      typeof template.dynamicField !== 'undefined' &&
      actual.dynamicField !== null &&
      typeof actual.dynamicField !== 'undefined'
    ) {
      inferTypeRefSubstitution(
        template.dynamicField,
        actual.dynamicField,
        parameterNames,
        substitutions,
        conflicts,
        libraries
      )
    }

    inferTypeRefTraitSubstitutions(
      template,
      actual,
      parameterNames,
      substitutions,
      conflicts,
      libraries
    )
  }
}

function inferTypeRefListSubstitutions(
  templates: TypeRef[],
  actuals: TypeRef[],
  parameterNames: string[],
  substitutions: TypeRefSubstitution[],
  conflicts: string[],
  libraries: CompilerLibrarySet
): void {
  if (templates.length !== actuals.length) {
    return
  }

  for (let index = 0; index < templates.length; index = index + 1) {
    const template = templates[index]
    const actual = actuals[index]

    if (
      template === null ||
      typeof template === 'undefined' ||
      actual === null ||
      typeof actual === 'undefined'
    ) {
      continue
    }

    inferTypeRefSubstitution(
      template,
      actual,
      parameterNames,
      substitutions,
      conflicts,
      libraries
    )
  }
}

function inferTypeRefTraitSubstitutions(
  template: ConcreteTypeRef,
  actual: ConcreteTypeRef,
  parameterNames: string[],
  substitutions: TypeRefSubstitution[],
  conflicts: string[],
  libraries: CompilerLibrarySet
): void {
  const templateTraits = typeRefTraits(template, libraries)
  const actualTraits = typeRefTraits(actual, libraries)

  for (let index = 0; index < templateTraits.length; index = index + 1) {
    const templateTrait = templateTraits[index]
    const actualTrait = actualTraits.find((candidate) => candidate.traitId === templateTrait.traitId)

    if (actualTrait !== null && typeof actualTrait !== 'undefined') {
      inferTypeRefListSubstitutions(
        templateTrait.args,
        actualTrait.args,
        parameterNames,
        substitutions,
        conflicts,
        libraries
      )
    }
  }
}

function recordTypeRefSubstitution(
  name: string,
  typeRef: TypeRef,
  substitutions: TypeRefSubstitution[],
  conflicts: string[],
  libraries: CompilerLibrarySet
): void {
  if (typeRef.kind === 'parameter' || typeRef.kind === 'unknown') {
    return
  }

  const existing = typeRefSubstitutionForName(substitutions, name)

  if (existing === null) {
    substitutions.push({ name, typeRef })
    return
  }

  if (
    !typeRefIsAssignable(typeRef, existing.typeRef, libraries) ||
    !typeRefIsAssignable(existing.typeRef, typeRef, libraries)
  ) {
    if (!conflicts.includes(name)) {
      conflicts.push(name)
    }
  }
}

function typeRefSubstitutionForName(
  substitutions: TypeRefSubstitution[],
  name: string
): TypeRefSubstitution | null {
  for (let index = 0; index < substitutions.length; index = index + 1) {
    if (substitutions[index].name === name) {
      return substitutions[index]
    }
  }

  return null
}

function objectTypeRefField(fields: ObjectTypeRefField[], name: string): ObjectTypeRefField | null {
  for (let index = 0; index < fields.length; index = index + 1) {
    if (fields[index].name === name) {
      return fields[index]
    }
  }

  return null
}
