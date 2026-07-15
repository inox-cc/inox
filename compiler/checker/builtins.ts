import { stdlibModuleLibuvRuntimeFeature } from '../stdlib/node/modules.ts'
import type { AnyNode, ObjectShapeInfo, SymbolInfo } from '../types.ts'

function readonlyStringFields(names: string[]): AnyNode[] {
  const fields: AnyNode[] = []

  for (const name of names) {
    fields.push({
      name,
      valueType: 'string',
      readonly: true
    })
  }

  return fields
}

export const fetchResponseObjectShape: ObjectShapeInfo = {
  kind: 'object',
  builtin: 'fetch.Response',
  fields: [
    {
      name: 'status',
      valueType: 'number',
      readonly: true
    },
    {
      name: 'ok',
      valueType: 'boolean',
      readonly: true
    },
    {
      name: 'url',
      valueType: 'string',
      readonly: true
    },
    {
      name: 'statusText',
      valueType: 'string',
      readonly: true
    },
    {
      name: 'redirected',
      valueType: 'boolean',
      readonly: true
    },
    {
      name: 'headers',
      valueType: 'object',
      shape: {
        kind: 'object',
        builtin: 'fetch.Headers',
        fields: []
      },
      readonly: true
    }
  ]
}

export const fetchHeadersObjectShape: ObjectShapeInfo = {
  kind: 'object',
  builtin: 'fetch.Headers',
  fields: []
}

export const fetchAbortSignalObjectShape: ObjectShapeInfo = {
  kind: 'object',
  builtin: 'fetch.AbortSignal',
  fields: [
    {
      name: 'aborted',
      valueType: 'boolean',
      readonly: true
    }
  ]
}

export const fetchAbortControllerObjectShape: ObjectShapeInfo = {
  kind: 'object',
  builtin: 'fetch.AbortController',
  fields: [
    {
      name: 'signal',
      valueType: 'object',
      shape: fetchAbortSignalObjectShape,
      readonly: true
    }
  ]
}

export function libuvOnlyRuntimeImportFeature(source: string): string | null {
  return stdlibModuleLibuvRuntimeFeature(source)
}

export const globals: Map<string, SymbolInfo> = new Map([
  [
    'console',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object'
    }
  ],
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
    'Set',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object',
      constructable: true
    }
  ],
  [
    'Map',
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
    'AbortController',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object',
      constructable: true
    }
  ],
  [
    'fetch',
    {
      kind: 'global',
      mutable: false,
      valueType: 'function'
    }
  ],
  [
    'JSON',
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
  if (name === 'fetch') {
    return {
      kind: 'global',
      mutable: false,
      valueType: 'function'
    }
  }

  if (
    name === 'Promise' ||
    name === 'Set' ||
    name === 'Map' ||
    name === 'Array' ||
    name === 'AbortController' ||
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

  if (
    name === 'console' ||
    name === 'Object' ||
    name === 'JSON'
  ) {
    return {
      kind: 'global',
      mutable: false,
      valueType: 'object'
    }
  }

  return null
}
