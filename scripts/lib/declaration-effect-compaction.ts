const retainedDeclarationEffectModuleFields = new Set([
  'declarationProgram',
  'externalFunctionEffects',
  'imports',
  'ir',
  'path',
  'reexports'
])
const retainedDeclarationEffectChildFields = new Set([
  'alternate',
  'args',
  'argument',
  'block',
  'body',
  'callee',
  'cases',
  'condition',
  'consequent',
  'discriminant',
  'elements',
  'expression',
  'expressions',
  'finalizer',
  'functionDeclarations',
  'functionEffects',
  'handler',
  'imports',
  'index',
  'init',
  'iterable',
  'left',
  'methods',
  'object',
  'path',
  'properties',
  'reexports',
  'right',
  'specifiers',
  'target',
  'test',
  'throwValueTypes',
  'topLevelItems',
  'update',
  'value'
])

type DeclarationEffectModuleLike = {
  declarationProgram?: unknown | null
  ir?: unknown | null
}

/** Releases declaration-only state before retaining a module for effect analysis. */
export function compactDeclarationEffectModule(module: DeclarationEffectModuleLike): void {
  const record = module as unknown as Record<string, unknown>

  for (const key of Object.keys(record)) {
    if (!retainedDeclarationEffectModuleFields.has(key)) {
      delete record[key]
    }
  }

  module.declarationProgram = null
  record.ir = compactDeclarationEffectMetadata(module.ir)
  record.imports = compactDeclarationEffectMetadata(record.imports)
  record.reexports = compactDeclarationEffectMetadata(record.reexports)
}

function compactDeclarationEffectMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items: unknown[] = []

    for (const item of value) {
      items.push(compactDeclarationEffectMetadata(item))
    }

    return items
  }

  if (value === null || typeof value !== 'object') {
    return value
  }

  const source = value as Record<string, unknown>
  const result: Record<string, unknown> = {}

  for (const key of Object.keys(source)) {
    const child = source[key]

    if (child === null || typeof child !== 'object') {
      result[key] = child
      continue
    }

    if (retainedDeclarationEffectChildFields.has(key)) {
      result[key] = compactDeclarationEffectMetadata(child)
    }
  }

  return result
}
