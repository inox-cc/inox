import { stdlibModuleLibuvRuntimeFeature } from '../stdlib/node/modules.ts'
import type { SymbolInfo } from '../types.ts'

export function libuvOnlyRuntimeImportFeature(source: string): string | null {
  return stdlibModuleLibuvRuntimeFeature(source)
}

export const globals: Map<string, SymbolInfo> = new Map([
  [
    'Promise',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object',
      constructable: true
    }
  ],
  [
    'Array',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object',
      constructable: true
    }
  ],
  [
    'Object',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object'
    }
  ],
  [
    'Int8Array',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object',
      constructable: true
    }
  ],
  [
    'Uint16Array',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object',
      constructable: true
    }
  ],
  [
    'Int16Array',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object',
      constructable: true
    }
  ],
  [
    'Uint32Array',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object',
      constructable: true
    }
  ],
  [
    'Int32Array',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object',
      constructable: true
    }
  ]
])

export function builtinGlobalSymbol(name: string): SymbolInfo | null {
  if (
    name === 'Promise' ||
    name === 'Array' ||
    name === 'Int8Array' ||
    name === 'Uint16Array' ||
    name === 'Int16Array' ||
    name === 'Uint32Array' ||
    name === 'Int32Array'
  ) {
    return {
      kind: 'global',
      mutable: false,
      valueType: 'object',
      constructable: true
    }
  }

  if (name === 'Object') {
    return {
      kind: 'global',
      mutable: false,
      valueType: 'object'
    }
  }

  return null
}
