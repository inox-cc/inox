import { diagnostic } from '../diagnostics.ts'
import { parseGlobalDeclarationContractResult } from '../modules/declarations.ts'
import type { AnyNode, Diagnostic, ProgramNode } from '../types.ts'
import type { LibraryDeclarationDescriptor } from './types.ts'

export type ParsedCompilerLibraryGlobalDeclaration = {
  libraryId: string
  source: string
  program: ProgramNode
}

export type ParseCompilerLibraryGlobalDeclarationsResult = {
  declarations: ParsedCompilerLibraryGlobalDeclaration[]
  diagnostics: Diagnostic[]
}

type AmbientDeclarationOwner = {
  libraryId: string
  source: string
  kind: string
}

export function parseCompilerLibraryGlobalDeclarations(
  descriptors: LibraryDeclarationDescriptor[]
): ParseCompilerLibraryGlobalDeclarationsResult {
  const declarations: ParsedCompilerLibraryGlobalDeclaration[] = []
  const diagnostics: Diagnostic[] = []
  const typeOwners: Map<string, AmbientDeclarationOwner> = new Map()
  const valueOwners: Map<string, AmbientDeclarationOwner> = new Map()

  for (let index = 0; index < descriptors.length; index = index + 1) {
    const descriptor = descriptors[index]

    if (descriptor.kind !== 'global') {
      continue
    }

    const parsed = parseGlobalDeclarationContractResult(
      descriptor.declarationSource,
      descriptor.source
    )

    for (let diagnosticIndex = 0; diagnosticIndex < parsed.diagnostics.length; diagnosticIndex = diagnosticIndex + 1) {
      diagnostics.push(parsed.diagnostics[diagnosticIndex])
    }

    if (parsed.diagnostics.length > 0) {
      continue
    }

    declarations.push({
      libraryId: descriptor.libraryId,
      source: descriptor.source,
      program: parsed.program
    })

    for (let itemIndex = 0; itemIndex < parsed.program.body.length; itemIndex = itemIndex + 1) {
      const item = parsed.program.body[itemIndex]
      const itemType = item.type

      if (!itemType) {
        continue
      }

      const owner: AmbientDeclarationOwner = {
        libraryId: descriptor.libraryId,
        source: descriptor.source,
        kind: itemType
      }

      if (ambientDeclarationHasValue(item)) {
        validateAmbientDeclarationOwner(valueOwners, 'value', item, owner, diagnostics)
      }

      if (ambientDeclarationHasType(item)) {
        validateAmbientDeclarationOwner(typeOwners, 'type', item, owner, diagnostics)
      }
    }
  }

  return {
    declarations,
    diagnostics
  }
}

export function compilerLibraryGlobalTypeNames(descriptors: LibraryDeclarationDescriptor[]): Set<string> {
  const names: Set<string> = new Set()
  const parsed = parseCompilerLibraryGlobalDeclarations(descriptors)

  for (const declaration of parsed.declarations) {
    for (const item of declaration.program.body) {
      if (ambientDeclarationHasType(item)) {
        names.add(item.name)
      }
    }
  }

  return names
}

function ambientDeclarationHasValue(item: AnyNode): boolean {
  return (
    item.type === 'FunctionDeclaration' ||
    item.type === 'VariableDeclaration' ||
    item.type === 'ClassDeclaration'
  )
}

function ambientDeclarationHasType(item: AnyNode): boolean {
  return item.type === 'TypeAliasDeclaration' || item.type === 'ClassDeclaration'
}

function validateAmbientDeclarationOwner(
  owners: Map<string, AmbientDeclarationOwner>,
  namespace: 'type' | 'value',
  item: AnyNode,
  owner: AmbientDeclarationOwner,
  diagnostics: Diagnostic[]
): void {
  const existing = owners.get(item.name)

  if (existing === null || typeof existing === 'undefined') {
    owners.set(item.name, owner)
    return
  }

  if (
    namespace === 'value' &&
    existing.libraryId === owner.libraryId &&
    existing.kind === 'FunctionDeclaration' &&
    owner.kind === 'FunctionDeclaration'
  ) {
    return
  }

  if (existing.libraryId === owner.libraryId && existing.source === owner.source) {
    diagnostics.push(
      diagnostic(
        'INOX_DUPLICATE_LIBRARY_GLOBAL',
        `Duplicate ambient global ${namespace} ${item.name} in ${owner.libraryId} (${owner.source})`,
        item.loc
      )
    )
    return
  }

  diagnostics.push(
    diagnostic(
      'INOX_DUPLICATE_LIBRARY_GLOBAL',
      `Duplicate ambient global ${namespace} ${item.name}: ` +
        `${existing.libraryId} (${existing.source}) and ${owner.libraryId} (${owner.source})`,
      item.loc
    )
  )
}
