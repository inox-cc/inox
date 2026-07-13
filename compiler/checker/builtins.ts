import { debugMemoryStatsFields } from '../../stdlib/global/compiler/descriptor.ts'
import { stdlibModuleLibuvRuntimeFeature } from '../stdlib/node/modules.ts'
import type { AnyNode, ObjectShapeInfo, SymbolInfo } from '../types.ts'

type DebugMemoryStatsField = {
  name: string
  cField: string
}

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

function readonlyDebugMemoryStatsFields(names: DebugMemoryStatsField[]): AnyNode[] {
  const fields: AnyNode[] = []

  for (let index = 0; index < names.length; index = index + 1) {
    const field = names[index] as DebugMemoryStatsField

    fields.push({
      name: field.name,
      valueType: 'number',
      readonly: true
    })
  }

  return fields
}

export const errorObjectShape: ObjectShapeInfo = {
  kind: 'object',
  fields: [
    {
      name: 'name',
      valueType: 'string',
      readonly: true
    },
    {
      name: 'message',
      valueType: 'string',
      readonly: true
    },
    {
      name: 'code',
      valueType: 'string',
      readonly: true
    },
    {
      name: 'cause',
      valueType: 'object',
      nullable: true,
      readonly: true
    }
  ]
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

export const debugMemoryStatsObjectShape: ObjectShapeInfo = {
  kind: 'object',
  builtin: 'inox.DebugMemoryStats',
  fields: readonlyDebugMemoryStatsFields(debugMemoryStatsFields)
}

export function libuvOnlyRuntimeImportFeature(source: string): string | null {
  return stdlibModuleLibuvRuntimeFeature(source)
}

export const globals: Map<string, SymbolInfo> = new Map([
  [
    'inox',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object'
    }
  ],
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
    'Date',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object',
      constructable: true
    }
  ],
  [
    'Error',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object',
      constructable: true
    }
  ],
  [
    'performance',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object'
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
    'setTimeout',
    {
      kind: 'global',
      mutable: false,
      valueType: 'function'
    }
  ],
  [
    'clearTimeout',
    {
      kind: 'global',
      mutable: false,
      valueType: 'function'
    }
  ],
  [
    'setInterval',
    {
      kind: 'global',
      mutable: false,
      valueType: 'function'
    }
  ],
  [
    'clearInterval',
    {
      kind: 'global',
      mutable: false,
      valueType: 'function'
    }
  ],
  [
    'setImmediate',
    {
      kind: 'global',
      mutable: false,
      valueType: 'function'
    }
  ],
  [
    'clearImmediate',
    {
      kind: 'global',
      mutable: false,
      valueType: 'function'
    }
  ],
  [
    'http',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object'
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
    'Math',
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
    name === 'fetch' ||
    name === 'setTimeout' ||
    name === 'clearTimeout' ||
    name === 'setInterval' ||
    name === 'clearInterval' ||
    name === 'setImmediate' ||
    name === 'clearImmediate'
  ) {
    return {
      kind: 'global',
      mutable: false,
      valueType: 'function'
    }
  }

  if (
    name === 'Promise' ||
    name === 'Date' ||
    name === 'Error' ||
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
    name === 'inox' ||
    name === 'console' ||
    name === 'performance' ||
    name === 'Object' ||
    name === 'http' ||
    name === 'JSON' ||
    name === 'Math'
  ) {
    return {
      kind: 'global',
      mutable: false,
      valueType: 'object'
    }
  }

  return null
}
