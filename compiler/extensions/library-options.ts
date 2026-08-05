import type {
  CompilerLibraryOptionValue,
  CompilerLibrarySet,
  LibraryOptionConditionDescriptor,
  LibraryOptionDescriptor,
  LibraryOptionScalar,
  RuntimeRequirementDescriptor
} from './types.ts'

export type ResolvedCompilerLibraryOption = {
  descriptor: LibraryOptionDescriptor
  present: boolean
  value: LibraryOptionScalar
}

type LibraryAutomaticOptionDescriptor = {
  automaticStringValue?: string
  automaticNumberValue?: number
  automaticBooleanValue?: boolean
}

const reservedCompilerCliAliases = [
  '--emit',
  '--entry',
  '--build-manifest',
  '--help',
  '--name',
  '--out',
  '--out-dir',
  '--release',
  '-h',
  '-o'
]

export function compilerLibraryOptionScalarText(value: LibraryOptionScalar): string {
  if (typeof value === 'string') {
    return value as string
  }

  if (typeof value === 'number') {
    return (value as number).toString()
  }

  return (value as boolean) ? 'true' : 'false'
}

export function compilerLibraryOptionScalarType(value: LibraryOptionScalar): string {
  if (typeof value === 'string') {
    return 'string'
  }

  if (typeof value === 'number') {
    return 'number'
  }

  return 'boolean'
}

export function compilerLibraryOptionScalarsEqual(
  left: LibraryOptionScalar,
  right: LibraryOptionScalar
): boolean {
  if (typeof left === 'string') {
    if (typeof right !== 'string') {
      return false
    }

    return (left as string) === (right as string)
  }

  if (typeof left === 'number') {
    if (typeof right !== 'number') {
      return false
    }

    return (left as number) === (right as number)
  }

  if (typeof right !== 'boolean') {
    return false
  }

  return (left as boolean) === (right as boolean)
}

export function compilerLibraryAutomaticOptionValues(
  libraries: CompilerLibrarySet
): CompilerLibraryOptionValue[] {
  const descriptors = libraries.options ?? []
  const result: CompilerLibraryOptionValue[] = []

  for (let index = 0; index < descriptors.length; index = index + 1) {
    const descriptor = descriptors[index]
    const value = libraryAutomaticOptionValue(descriptor)

    if (value !== null) {
      result.push({ optionId: descriptor.optionId, value })
    }
  }

  return result
}

export function compilerLibraryAutomaticOptionValue(
  libraries: CompilerLibrarySet,
  optionId: string
): CompilerLibraryOptionValue | null {
  const descriptor = compilerLibraryOptionDescriptor(libraries.options ?? [], optionId)

  if (descriptor === null) {
    return null
  }

  const value = libraryAutomaticOptionValue(descriptor)

  if (value === null) {
    return null
  }

  return { optionId, value }
}

export function mergeCompilerLibraryOptionValues(
  groups: CompilerLibraryOptionValue[][]
): CompilerLibraryOptionValue[] {
  const result: CompilerLibraryOptionValue[] = []

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex = groupIndex + 1) {
    const group = groups[groupIndex]

    for (let optionIndex = 0; optionIndex < group.length; optionIndex = optionIndex + 1) {
      const option = group[optionIndex]
      let replaced = false

      for (let resultIndex = 0; resultIndex < result.length; resultIndex = resultIndex + 1) {
        if (result[resultIndex].optionId === option.optionId) {
          result[resultIndex] = option
          replaced = true
          break
        }
      }

      if (!replaced) {
        result.push(option)
      }
    }
  }

  return result
}

export function compilerLibraryOptionsFingerprint(
  libraries: CompilerLibrarySet,
  selections: CompilerLibraryOptionValue[] | null | undefined
): string {
  const resolved = resolveCompilerLibraryOptions(libraries, selections)
  const rows: string[] = []

  for (let index = 0; index < resolved.length; index = index + 1) {
    const option = resolved[index]
    const id = option.descriptor.optionId
    const value = compilerLibraryOptionScalarText(option.value)

    rows.push(
      id.length.toString() + ':' + id + ':' + option.descriptor.valueType + ':' +
        (option.present ? 'present' : 'default') + ':' + value.length.toString() + ':' + value
    )
  }

  rows.sort()
  let fingerprint = 'inox:library-options:v1'

  for (let index = 0; index < rows.length; index = index + 1) {
    fingerprint = fingerprint + '|' + rows[index]
  }

  return fingerprint
}

export function resolveCompilerLibraryOptions(
  libraries: CompilerLibrarySet,
  selections: CompilerLibraryOptionValue[] | null | undefined
): ResolvedCompilerLibraryOption[] {
  const descriptors = libraries.options ?? []
  const values = selections ?? []
  const resolved: ResolvedCompilerLibraryOption[] = []
  const seen: Set<string> = new Set()

  for (let index = 0; index < values.length; index = index + 1) {
    const selection = values[index]

    if (seen.has(selection.optionId)) {
      throw new Error(`duplicate compiler library option ${selection.optionId}`)
    }

    seen.add(selection.optionId)

    if (compilerLibraryOptionDescriptor(descriptors, selection.optionId) === null) {
      throw new Error(`unknown compiler library option ${selection.optionId}`)
    }
  }

  for (let index = 0; index < descriptors.length; index = index + 1) {
    const descriptor = descriptors[index]
    const selected = compilerLibraryOptionSelection(values, descriptor.optionId)
    const present = selected !== null
    const value = present ? selected.value : descriptor.defaultValue

    validateCompilerLibraryOptionValue(descriptor, value)
    resolved.push({ descriptor, present, value })
  }

  return resolved
}

export function resolveCompilerLibraryOptionValue(
  libraries: CompilerLibrarySet,
  selections: CompilerLibraryOptionValue[] | null | undefined,
  optionId: string
): LibraryOptionScalar | null {
  const option = resolvedCompilerLibraryOption(resolveCompilerLibraryOptions(libraries, selections), optionId)

  return option === null ? null : option.value
}

export function validateCompilerLibraryOptionDescriptors(
  descriptors: LibraryOptionDescriptor[]
): void {
  const ids: Set<string> = new Set()
  const aliases: Set<string> = new Set()

  for (let index = 0; index < descriptors.length; index = index + 1) {
    const descriptor = descriptors[index]

    if (ids.has(descriptor.optionId)) {
      throw new Error(`duplicate compiler library option descriptor ${descriptor.optionId}`)
    }

    ids.add(descriptor.optionId)
    validateCompilerLibraryOptionDescriptorShape(descriptor)
    validateCompilerLibraryOptionAllowedValues(descriptor)
    validateCompilerLibraryOptionValue(descriptor, descriptor.defaultValue)

    const automaticValue = libraryAutomaticOptionValue(descriptor)

    if (automaticValue !== null) {
      validateCompilerLibraryOptionValue(descriptor, automaticValue)
    }

    for (let aliasIndex = 0; aliasIndex < descriptor.cliAliases.length; aliasIndex = aliasIndex + 1) {
      const alias = descriptor.cliAliases[aliasIndex]

      if (alias.length < 2 || !alias.startsWith('-')) {
        throw new Error(`compiler library option CLI alias ${alias} must start with -`)
      }

      if (compilerLibraryCliAliasIsReserved(alias)) {
        throw new Error(`compiler library option CLI alias ${alias} is reserved`)
      }

      if (aliases.has(alias)) {
        throw new Error(`duplicate compiler library option CLI alias ${alias}`)
      }

      aliases.add(alias)
    }
  }
}

function validateCompilerLibraryOptionDescriptorShape(descriptor: LibraryOptionDescriptor): void {
  const minimum = descriptor.minimum
  const maximum = descriptor.maximum
  const hasMinimum = minimum !== null && typeof minimum !== 'undefined'
  const hasMaximum = maximum !== null && typeof maximum !== 'undefined'

  if (
    descriptor.valueType !== 'number' &&
    (descriptor.integer === true || hasMinimum || hasMaximum)
  ) {
    throw new Error(`${descriptor.optionId} numeric constraints require number valueType`)
  }

  if (hasMinimum && (typeof minimum !== 'number' || minimum - minimum !== 0)) {
    throw new Error(`${descriptor.optionId} has an invalid minimum`)
  }

  if (hasMaximum && (typeof maximum !== 'number' || maximum - maximum !== 0)) {
    throw new Error(`${descriptor.optionId} has an invalid maximum`)
  }

  if (
    descriptor.integer === true &&
    (
      hasMinimum && (minimum as number) % 1 !== 0 ||
      hasMaximum && (maximum as number) % 1 !== 0
    )
  ) {
    throw new Error(`${descriptor.optionId} integer bounds must be integers`)
  }

  if (hasMinimum && hasMaximum && (minimum as number) > (maximum as number)) {
    throw new Error(
      `${descriptor.optionId} minimum ${compilerLibraryOptionScalarText(minimum as number)} exceeds maximum ` +
        compilerLibraryOptionScalarText(maximum as number)
    )
  }
}

function validateCompilerLibraryOptionAllowedValues(descriptor: LibraryOptionDescriptor): void {
  const values = descriptor.allowedValues ?? []

  for (let index = 0; index < values.length; index = index + 1) {
    const value = values[index]

    if (compilerLibraryOptionScalarType(value) !== descriptor.valueType) {
      throw new Error(
        `compiler library option ${descriptor.optionId} allowed value ` +
          `${compilerLibraryOptionScalarText(value)} expects ${descriptor.valueType}`
      )
    }

    for (let previousIndex = 0; previousIndex < index; previousIndex = previousIndex + 1) {
      if (compilerLibraryOptionScalarsEqual(values[previousIndex], value)) {
        throw new Error(
          `duplicate compiler library option ${descriptor.optionId} allowed value ` +
            compilerLibraryOptionScalarText(value)
        )
      }
    }

    validateCompilerLibraryOptionValue(descriptor, value)
  }
}

function compilerLibraryCliAliasIsReserved(alias: string): boolean {
  for (let index = 0; index < reservedCompilerCliAliases.length; index = index + 1) {
    if (reservedCompilerCliAliases[index] === alias) {
      return true
    }
  }

  return false
}

export function compilerLibraryOptionForCliAlias(
  libraries: CompilerLibrarySet,
  alias: string
): LibraryOptionDescriptor | null {
  const descriptors = libraries.options ?? []

  for (let index = 0; index < descriptors.length; index = index + 1) {
    const descriptor = descriptors[index]

    for (let aliasIndex = 0; aliasIndex < descriptor.cliAliases.length; aliasIndex = aliasIndex + 1) {
      if (descriptor.cliAliases[aliasIndex] === alias) {
        return descriptor
      }
    }
  }

  return null
}

export function parseCompilerLibraryOptionCliValue(
  descriptor: LibraryOptionDescriptor,
  source: string
): LibraryOptionScalar {
  let value: LibraryOptionScalar = source

  if (descriptor.valueType === 'number') {
    value = Number(source)
  } else if (descriptor.valueType === 'boolean') {
    if (source === 'true') {
      value = true
    } else if (source === 'false') {
      value = false
    } else {
      throw new Error(`${descriptor.optionId} expects true or false`)
    }
  }

  validateCompilerLibraryOptionValue(descriptor, value)
  return value
}

export function compilerLibraryCapabilities(
  libraries: CompilerLibrarySet,
  requirementIds: string[],
  selections: CompilerLibraryOptionValue[] | null | undefined
): string[] {
  const resolved = resolveCompilerLibraryOptions(libraries, selections)
  const requirements = expandedRuntimeRequirements(libraries.runtimeRequirements, requirementIds)
  const capabilities: string[] = []

  for (let index = 0; index < requirements.length; index = index + 1) {
    const requirement = requirements[index]

    for (let capabilityIndex = 0; capabilityIndex < requirement.capabilities.length; capabilityIndex = capabilityIndex + 1) {
      const capability = requirement.capabilities[capabilityIndex]

      if (!capabilities.includes(capability)) {
        capabilities.push(capability)
      }
    }

    const conditional = requirement.conditionalCapabilities ?? []

    for (let capabilityIndex = 0; capabilityIndex < conditional.length; capabilityIndex = capabilityIndex + 1) {
      const item = conditional[capabilityIndex]
      let matches = true

      for (let conditionIndex = 0; conditionIndex < item.conditions.length; conditionIndex = conditionIndex + 1) {
        if (!compilerLibraryOptionConditionMatches(resolved, item.conditions[conditionIndex])) {
          matches = false
          break
        }
      }

      if (matches && !capabilities.includes(item.capability)) {
        capabilities.push(item.capability)
      }
    }
  }

  return capabilities
}

function compilerLibraryOptionConditionMatches(
  resolved: ResolvedCompilerLibraryOption[],
  condition: LibraryOptionConditionDescriptor
): boolean {
  const option = resolvedCompilerLibraryOption(resolved, condition.optionId)

  if (option === null) {
    return false
  }

  for (let index = 0; index < condition.values.length; index = index + 1) {
    const expected = condition.values[index]

    if (
      condition.source === 'present' &&
      typeof expected === 'boolean' &&
      (expected as boolean) === option.present
    ) {
      return true
    }

    if (
      condition.source === 'value' &&
      compilerLibraryOptionScalarsEqual(expected, option.value)
    ) {
      return true
    }
  }

  return false
}

function expandedRuntimeRequirements(
  descriptors: RuntimeRequirementDescriptor[],
  selected: string[]
): RuntimeRequirementDescriptor[] {
  const result: RuntimeRequirementDescriptor[] = []
  const pending: string[] = []
  const seen: Set<string> = new Set()

  for (let index = 0; index < selected.length; index = index + 1) {
    pending.push(selected[index])
  }

  for (let index = 0; index < pending.length; index = index + 1) {
    const id = pending[index]

    if (seen.has(id)) {
      continue
    }

    seen.add(id)
    const descriptor = runtimeRequirementDescriptor(descriptors, id)

    if (descriptor === null) {
      continue
    }

    result.push(descriptor)

    for (let dependencyIndex = 0; dependencyIndex < descriptor.dependencies.length; dependencyIndex = dependencyIndex + 1) {
      pending.push(descriptor.dependencies[dependencyIndex])
    }
  }

  return result
}

export function expandedRuntimeRequirementIds(
  descriptors: RuntimeRequirementDescriptor[],
  selected: string[]
): string[] {
  const result: string[] = []
  const pending = selected.slice()

  for (let index = 0; index < pending.length; index = index + 1) {
    const id = pending[index]

    if (result.includes(id)) {
      continue
    }

    result.push(id)
    const descriptor = runtimeRequirementDescriptor(descriptors, id)

    if (descriptor === null) {
      continue
    }

    for (let dependencyIndex = 0; dependencyIndex < descriptor.dependencies.length; dependencyIndex = dependencyIndex + 1) {
      pending.push(descriptor.dependencies[dependencyIndex])
    }
  }

  result.sort()
  return result
}

function runtimeRequirementDescriptor(
  descriptors: RuntimeRequirementDescriptor[],
  id: string
): RuntimeRequirementDescriptor | null {
  for (let index = 0; index < descriptors.length; index = index + 1) {
    if (descriptors[index].id === id) {
      return descriptors[index]
    }
  }

  return null
}

export function validateCompilerLibraryOptionValue(
  descriptor: LibraryOptionDescriptor,
  value: LibraryOptionScalar
): void {
  if (
    (descriptor.valueType === 'string' && typeof value !== 'string') ||
    (descriptor.valueType === 'number' && typeof value !== 'number') ||
    (descriptor.valueType === 'boolean' && typeof value !== 'boolean')
  ) {
    throw new Error(`${descriptor.optionId} expects ${descriptor.valueType}`)
  }

  const allowed = descriptor.allowedValues ?? []

  if (allowed.length > 0 && !libraryOptionScalarArrayIncludes(allowed, value)) {
    throw new Error(
      `${descriptor.optionId} expects one of ${compilerLibraryOptionScalarListText(allowed)}`
    )
  }

  if (typeof value !== 'number') {
    return
  }

  const numberValue = value as number

  if (numberValue - numberValue !== 0) {
    throw new Error(compilerLibraryOptionNumberMessage(descriptor))
  }

  if (descriptor.integer === true && numberValue % 1 !== 0) {
    throw new Error(compilerLibraryOptionNumberMessage(descriptor))
  }

  if (descriptor.minimum !== null && typeof descriptor.minimum !== 'undefined' && numberValue < descriptor.minimum) {
    throw new Error(compilerLibraryOptionNumberMessage(descriptor))
  }

  if (descriptor.maximum !== null && typeof descriptor.maximum !== 'undefined' && numberValue > descriptor.maximum) {
    throw new Error(compilerLibraryOptionNumberMessage(descriptor))
  }
}

function compilerLibraryOptionScalarListText(values: LibraryOptionScalar[]): string {
  let source = ''

  for (let index = 0; index < values.length; index = index + 1) {
    if (index > 0) {
      source = source + ', '
    }

    source = source + compilerLibraryOptionScalarText(values[index])
  }

  return source
}

function compilerLibraryOptionNumberMessage(descriptor: LibraryOptionDescriptor): string {
  if (
    descriptor.integer === true &&
    descriptor.minimum !== null &&
    typeof descriptor.minimum !== 'undefined' &&
    descriptor.maximum !== null &&
    typeof descriptor.maximum !== 'undefined'
  ) {
    return `${descriptor.optionId} must be an integer from ${descriptor.minimum} to ${descriptor.maximum}`
  }

  return `${descriptor.optionId} has an invalid numeric value`
}

function libraryOptionScalarArrayIncludes(
  values: LibraryOptionScalar[],
  expected: LibraryOptionScalar
): boolean {
  for (let index = 0; index < values.length; index = index + 1) {
    if (compilerLibraryOptionScalarsEqual(values[index], expected)) {
      return true
    }
  }

  return false
}

function compilerLibraryOptionDescriptor(
  descriptors: LibraryOptionDescriptor[],
  optionId: string
): LibraryOptionDescriptor | null {
  for (let index = 0; index < descriptors.length; index = index + 1) {
    if (descriptors[index].optionId === optionId) {
      return descriptors[index]
    }
  }

  return null
}

function libraryAutomaticOptionValue(descriptor: LibraryOptionDescriptor): LibraryOptionScalar | null {
  const automaticDescriptor = descriptor as LibraryAutomaticOptionDescriptor
  let value: LibraryOptionScalar | null = null
  let valueCount = 0

  if (typeof automaticDescriptor.automaticStringValue === 'string') {
    value = automaticDescriptor.automaticStringValue
    valueCount = valueCount + 1
  }

  if (typeof automaticDescriptor.automaticNumberValue === 'number') {
    value = automaticDescriptor.automaticNumberValue
    valueCount = valueCount + 1
  }

  if (typeof automaticDescriptor.automaticBooleanValue === 'boolean') {
    value = automaticDescriptor.automaticBooleanValue
    valueCount = valueCount + 1
  }

  if (valueCount > 1) {
    throw new Error(`${descriptor.optionId} has multiple automatic values`)
  }

  return value
}

function compilerLibraryOptionSelection(
  selections: CompilerLibraryOptionValue[],
  optionId: string
): CompilerLibraryOptionValue | null {
  for (let index = 0; index < selections.length; index = index + 1) {
    if (selections[index].optionId === optionId) {
      return selections[index]
    }
  }

  return null
}

function resolvedCompilerLibraryOption(
  resolved: ResolvedCompilerLibraryOption[],
  optionId: string
): ResolvedCompilerLibraryOption | null {
  for (let index = 0; index < resolved.length; index = index + 1) {
    if (resolved[index].descriptor.optionId === optionId) {
      return resolved[index]
    }
  }

  return null
}
