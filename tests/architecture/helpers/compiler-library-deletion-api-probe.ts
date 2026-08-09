import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'

import { compileSource } from '../../../compiler/core.ts'
import { CompileError } from '../../../compiler/diagnostics.ts'
import type { CompilerLibrarySet } from '../../../compiler/extensions/types.ts'
import type { DiscoveredCompilerLibrary } from '../../../scripts/lib/compiler-library-discovery.ts'

export type CompilerLibraryDeletionApiProbe = {
  source: string
  presentDiagnosticCodes: string[]
  absentDiagnosticCodes: string[]
}

export type CompilerLibraryDeletionApiProbeResult = {
  diagnosticCodes: string[]
  runtimeRequirements: string[]
}

type PackageLocalDeletionProbe = {
  source: string
  absentDiagnosticCodes: string[]
}

export async function compilerLibraryDeletionApiProbe(
  library: DiscoveredCompilerLibrary,
  projectRoot: string = resolve('.')
): Promise<CompilerLibraryDeletionApiProbe> {
  const packageLocal = await packageLocalDeletionProbe(projectRoot, library)

  if (packageLocal !== null) {
    return {
      ...packageLocal,
      presentDiagnosticCodes: []
    }
  }

  if (library.kind !== 'global') {
    if (library.importSource === null) {
      throw new Error(`${library.id}: imported package requires an import source`)
    }

    const unsupported = library.compilerPackage === null ? ['INOX_UNSUPPORTED_IMPORT_SOURCE'] : []

    return {
      source: `import packageValue from '${library.importSource}'\npackageValue\n`,
      presentDiagnosticCodes: unsupported,
      absentDiagnosticCodes: ['INOX_UNSUPPORTED_IMPORT_SOURCE']
    }
  }

  const name = firstGlobalRuntimeName(library)

  if (name === null) {
    throw new Error(`${library.id}: package requires tests/compiler-deletion-probe.ts`)
  }

  return {
    source: `${name}\n`,
    presentDiagnosticCodes: [],
    absentDiagnosticCodes: ['INOX_UNKNOWN_NAME']
  }
}

export function runCompilerLibraryDeletionApiProbe(
  source: string,
  libraries: CompilerLibrarySet
): CompilerLibraryDeletionApiProbeResult {
  try {
    const result = compileSource(source, { libraries })

    return {
      diagnosticCodes: [],
      runtimeRequirements: result.ir.runtimeRequirements.slice().sort()
    }
  } catch (error) {
    if (!(error instanceof CompileError)) {
      throw error
    }

    return {
      diagnosticCodes: error.diagnostics.map((diagnostic) => diagnostic.code),
      runtimeRequirements: []
    }
  }
}

async function packageLocalDeletionProbe(
  projectRoot: string,
  library: DiscoveredCompilerLibrary
): Promise<PackageLocalDeletionProbe | null> {
  const path = resolve(projectRoot, library.root, 'tests/compiler-deletion-probe.ts')

  try {
    await access(path)
  } catch {
    return null
  }

  const loaded = (await import(pathToFileURL(path).href)) as {
    compilerLibraryDeletionProbe?: unknown
  }
  const probe = loaded.compilerLibraryDeletionProbe

  if (!isPackageLocalDeletionProbe(probe)) {
    throw new Error(`${library.id}: invalid tests/compiler-deletion-probe.ts export`)
  }

  return probe
}

function isPackageLocalDeletionProbe(value: unknown): value is PackageLocalDeletionProbe {
  if (value === null || typeof value !== 'object') {
    return false
  }

  const probe = value as Partial<PackageLocalDeletionProbe>

  return (
    typeof probe.source === 'string' &&
    probe.source.length > 0 &&
    Array.isArray(probe.absentDiagnosticCodes) &&
    probe.absentDiagnosticCodes.every((code) => typeof code === 'string')
  )
}

function firstGlobalRuntimeName(library: DiscoveredCompilerLibrary): string | null {
  if (library.declarationSource === null) {
    return null
  }

  const sourceFile = ts.createSourceFile(
    library.declarationPath ?? `${library.id}.d.ts`,
    library.declarationSource,
    ts.ScriptTarget.Latest,
    true
  )
  let result: string | null = null

  function visit(node: ts.Node, insideGlobal: boolean): void {
    if (result !== null) {
      return
    }

    if (ts.isModuleDeclaration(node)) {
      const name = moduleName(node)

      if (name === 'global') {
        if (typeof node.body !== 'undefined') {
          visit(node.body, true)
        }
        return
      }

      if (insideGlobal && name !== null) {
        result = name
        return
      }
    }

    if (insideGlobal) {
      if (
        (ts.isClassDeclaration(node) || ts.isEnumDeclaration(node) || ts.isFunctionDeclaration(node)) &&
        typeof node.name !== 'undefined'
      ) {
        result = node.name.text
        return
      }

      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        result = node.name.text
        return
      }
    }

    ts.forEachChild(node, (child) => visit(child, insideGlobal))
  }

  visit(sourceFile, false)
  return result
}

function moduleName(node: ts.ModuleDeclaration): string | null {
  return ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null
}
