import {
  compilerLibraryOptionScalarsEqual,
  compilerLibraryOptionScalarText,
  resolveCompilerLibraryOptions
} from '../extensions/library-options.ts'
import type {
  CompilerLibraryOptionValue,
  CompilerLibrarySet,
  LibraryCValueMappingDescriptor,
  LibraryOptionScalar,
  LibraryRuntimeInitializerArgumentDescriptor
} from '../extensions/types.ts'

export function emitCompilerLibraryRuntimeInitializerDefinitions(
  libraries: CompilerLibrarySet,
  runtimeRequirements: string[],
  selections: CompilerLibraryOptionValue[] | null | undefined
): string[] {
  const initializers = libraries.runtimeInitializers ?? []
  const resolved = resolveCompilerLibraryOptions(libraries, selections)
  const lines: string[] = []

  for (let index = 0; index < initializers.length; index = index + 1) {
    const initializer = initializers[index]

    if (!runtimeRequirements.includes(initializer.runtimeRequirement)) {
      continue
    }

    const args: string[] = []

    for (let argumentIndex = 0; argumentIndex < initializer.arguments.length; argumentIndex = argumentIndex + 1) {
      const argument = initializer.arguments[argumentIndex]
      let optionValue: LibraryOptionScalar | null = null

      for (let optionIndex = 0; optionIndex < resolved.length; optionIndex = optionIndex + 1) {
        const option = resolved[optionIndex]

        if (option.descriptor.optionId === argument.optionId) {
          optionValue = argument.source === 'present' ? option.present : option.value
          break
        }
      }

      if (optionValue === null) {
        throw new Error(`runtime initializer ${initializer.initializerId} references missing option ${argument.optionId}`)
      }

      args.push(emitCompilerLibraryInitializerArgument(argument, optionValue))
    }

    lines.push(`inline ${initializer.cType} ${initializer.cName}(${args.join(', ')});`)
  }

  return lines
}

function emitCompilerLibraryInitializerArgument(
  descriptor: LibraryRuntimeInitializerArgumentDescriptor,
  value: LibraryOptionScalar
): string {
  if (descriptor.cValueKind === 'mapped') {
    return mappedCompilerLibraryInitializerArgument(descriptor.cValueMap ?? [], value, descriptor.optionId)
  }

  if (descriptor.cValueKind === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new Error(`runtime initializer option ${descriptor.optionId} expects boolean`)
    }

    return value ? 'true' : 'false'
  }

  if (typeof value !== 'number') {
    throw new Error(`runtime initializer option ${descriptor.optionId} expects number`)
  }

  const numberValue = value as number

  if (descriptor.cValueKind === 'uint32-hex') {
    return `0x${numberValue.toString(16).padStart(8, '0')}u`
  }

  return numberValue.toString()
}

function mappedCompilerLibraryInitializerArgument(
  mappings: LibraryCValueMappingDescriptor[],
  value: LibraryOptionScalar,
  optionId: string
): string {
  for (let index = 0; index < mappings.length; index = index + 1) {
    if (compilerLibraryOptionScalarsEqual(mappings[index].value, value)) {
      return mappings[index].cExpression
    }
  }

  throw new Error(
    `runtime initializer option ${optionId} has no C++ mapping for ${compilerLibraryOptionScalarText(value)}`
  )
}
