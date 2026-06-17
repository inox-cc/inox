import type { AnyNode, ObjectShapeInfo, SymbolInfo } from '../types.ts'
import { debugMemoryStatsFields } from '../stdlib/descriptors/debug.ts'
import { pathParseObjectFields } from '../stdlib/descriptors/path.ts'
import { urlObjectFields } from '../stdlib/descriptors/url.ts'

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

  for (const field of names) {
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

export const fsStatsObjectShape: ObjectShapeInfo = {
  kind: 'object',
  builtin: 'fs.Stats',
  fields: [
    {
      name: 'size',
      valueType: 'number',
      readonly: true
    },
    {
      name: 'mode',
      valueType: 'number',
      readonly: true
    },
    {
      name: 'mtimeMs',
      valueType: 'number',
      readonly: true
    }
  ]
}

export const fsDirentObjectShape: ObjectShapeInfo = {
  kind: 'object',
  builtin: 'fs.Dirent',
  fields: [
    {
      name: 'name',
      valueType: 'string',
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

export const urlObjectShape: ObjectShapeInfo = {
  kind: 'object',
  builtin: 'url.URL',
  fields: readonlyStringFields(urlObjectFields)
}

export const urlSearchParamsObjectShape: ObjectShapeInfo = {
  kind: 'object',
  builtin: 'url.URLSearchParams',
  fields: []
}

export const childProcessSpawnSyncResultShape: ObjectShapeInfo = {
  kind: 'object',
  builtin: 'child_process.SpawnSyncReturns',
  fields: [
    {
      name: 'status',
      valueType: 'number',
      readonly: true
    },
    {
      name: 'stdout',
      valueType: 'string',
      readonly: true
    },
    {
      name: 'stderr',
      valueType: 'string',
      readonly: true
    }
  ]
}

export const pathParseObjectShape: ObjectShapeInfo = {
  kind: 'object',
  builtin: 'path.ParsedPath',
  fields: readonlyStringFields(pathParseObjectFields)
}

export const debugMemoryStatsObjectShape: ObjectShapeInfo = {
  kind: 'object',
  builtin: 'ccjs.DebugMemoryStats',
  fields: readonlyDebugMemoryStatsFields(debugMemoryStatsFields)
}

export const fsConstantValues = new Map([
  ['F_OK', 0],
  ['X_OK', 1],
  ['W_OK', 2],
  ['R_OK', 4]
])

export const libuvOnlyRuntimeImports = new Map([
  ['dgram', 'node:dgram'],
  ['http', 'node:http'],
  ['net', 'node:net'],
  ['node:crypto', 'node:crypto'],
  ['node:dgram', 'node:dgram'],
  ['node:http', 'node:http'],
  ['node:net', 'node:net']
])

export const globals: Map<string, SymbolInfo> = new Map([
  [
    'ccjs',
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
    'crypto',
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
    'Buffer',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object'
    }
  ],
  [
    'Uint8Array',
    {
      kind: 'global',
      mutable: false,
      valueType: 'object',
      constructable: true
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

export const numericCastNames = new Set(['i32', 'u32', 'u64', 'f32', 'f64'])
