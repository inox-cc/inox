import { diagnostic, throwDiagnostics } from '../diagnostics.ts'
import type { Diagnostic, IrFunctionEffect, IrThrowValueType } from '../types.ts'

type UnknownRecord = {
  [key: string]: unknown
}

export type ModuleFunctionEffectsContractParseResult = {
  functionEffects: IrFunctionEffect[]
  diagnostics: Diagnostic[]
}

export function emitModuleFunctionEffectsContract(functionEffects: IrFunctionEffect[]): string {
  const effects: IrFunctionEffect[] = []

  for (const effect of functionEffects) {
    effects.push({
      name: effect.name,
      throws: effect.throws,
      throwValueTypes: effect.throwValueTypes.slice()
    })
  }

  return `${JSON.stringify(
    {
      version: 2,
      functions: effects
    },
    null,
    2
  )}\n`
}

export function parseModuleFunctionEffectsContract(source: string, file: string | null = null): IrFunctionEffect[] {
  const result = parseModuleFunctionEffectsContractResult(source, file)

  throwDiagnostics(result.diagnostics)

  return result.functionEffects
}

export function parseModuleFunctionEffectsContractResult(
  source: string,
  file: string | null = null
): ModuleFunctionEffectsContractParseResult {
  const diagnostics: Diagnostic[] = []
  const parsed = parseJsonObject(source, file, diagnostics)

  if (parsed === null) {
    return {
      functionEffects: [],
      diagnostics
    }
  }

  if (parsed.version !== 2) {
    diagnostics.push(moduleFunctionEffectsDiagnostic('unsupported function effects contract version', file))
    return {
      functionEffects: [],
      diagnostics
    }
  }

  if (!Array.isArray(parsed.functions)) {
    diagnostics.push(moduleFunctionEffectsDiagnostic('function effects contract expects functions array', file))
    return {
      functionEffects: [],
      diagnostics
    }
  }

  const functionEffects: IrFunctionEffect[] = []

  for (const item of parsed.functions) {
    const effect = parseFunctionEffect(item, file, diagnostics)

    if (effect !== null) {
      functionEffects.push(effect)
    }
  }

  return {
    functionEffects,
    diagnostics
  }
}

function parseJsonObject(source: string, file: string | null, diagnostics: Diagnostic[]): UnknownRecord | null {
  try {
    const parsed: unknown = JSON.parse(source)

    if (isUnknownRecord(parsed)) {
      return parsed as UnknownRecord
    }

    diagnostics.push(moduleFunctionEffectsDiagnostic('function effects contract expects an object', file))
    return null
  } catch {
    diagnostics.push(moduleFunctionEffectsDiagnostic('cannot parse function effects contract', file))
    return null
  }
}

function parseFunctionEffect(value: unknown, file: string | null, diagnostics: Diagnostic[]): IrFunctionEffect | null {
  if (!isUnknownRecord(value)) {
    diagnostics.push(moduleFunctionEffectsDiagnostic('function effect entry expects an object', file))
    return null
  }

  const record = value as UnknownRecord
  const name = record.name
  const throws = record.throws
  const throwValueTypes = record.throwValueTypes

  if (typeof name !== 'string') {
    diagnostics.push(moduleFunctionEffectsDiagnostic('function effect entry expects string name', file))
    return null
  }

  if (typeof throws !== 'boolean') {
    diagnostics.push(moduleFunctionEffectsDiagnostic(`function effect ${name} expects boolean throws`, file))
    return null
  }

  if (!Array.isArray(throwValueTypes)) {
    diagnostics.push(moduleFunctionEffectsDiagnostic(`function effect ${name} expects throwValueTypes array`, file))
    return null
  }

  const types: IrThrowValueType[] = []

  for (const item of throwValueTypes) {
    if (!isIrThrowValueType(item)) {
      diagnostics.push(
        moduleFunctionEffectsDiagnostic(`function effect ${name} has unsupported throw value type`, file)
      )
      return null
    }

    types.push(item as IrThrowValueType)
  }

  return {
    name,
    throws,
    throwValueTypes: types
  }
}

function isUnknownRecord(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isIrThrowValueType(value: unknown): boolean {
  return value === 'exception-object' || value === 'other' || value === 'string'
}

function moduleFunctionEffectsDiagnostic(message: string, file: string | null): Diagnostic {
  return diagnostic('INOX_FUNCTION_EFFECTS_CONTRACT', message, {
    file: file ?? '',
    line: 1,
    column: 1
  })
}
