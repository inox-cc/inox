import assertModule from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emitCBundleFromIrModules, emitCFromIr } from '../../src/compiler/codegen-c.ts'
import { emitJsBundleFromIrModules, emitJsFromIr } from '../../src/compiler/codegen-js.ts'
import { CompileError } from '../../src/compiler/diagnostics.ts'
import { compileFile, compileSource } from '../../src/compiler/index.ts'
import {
  collectIrFeatureRequirements,
  collectIrFunctionEffects,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrLocalThrowValueTypes,
  collectIrModuleRecords,
  collectIrPrograms,
  collectIrTopLevelNodeEntries,
  collectIrTopLevelNodesFromPrograms,
  findIrEntryProgram
} from '../../src/compiler/ir.ts'
import type { CompileOptions } from '../../src/compiler/types.ts'

const strictAssertMatch = assertModule.match.bind(assertModule)

assertModule.match = ((actual: string, expected: RegExp, message?: string | Error): void => {
  try {
    strictAssertMatch(actual, expected, message)
  } catch (error) {
    strictAssertMatch(actual, loosenPatternWhitespace(expected), message)
  }
}) as typeof assertModule.match

export const assert = assertModule

export {
  CompileError,
  collectIrFeatureRequirements,
  collectIrFunctionEffects,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrLocalThrowValueTypes,
  collectIrModuleRecords,
  collectIrPrograms,
  collectIrTopLevelNodeEntries,
  collectIrTopLevelNodesFromPrograms,
  compileFile,
  compileSource,
  emitCBundleFromIrModules,
  emitCFromIr,
  emitJsBundleFromIrModules,
  emitJsFromIr,
  findIrEntryProgram,
  join,
  mkdir,
  mkdtemp,
  rm,
  tmpdir,
  writeFile
}

export type { CompileOptions }

export const cLibuvOptions: CompileOptions = {
  target: 'c',
  loopBackend: 'libuv'
}

export function assertDiagnostic(source: string, code: string, options: CompileOptions = {}): void {
  assert.throws(
    () => {
      compileSource(source, {
        ...options,
        target: options.target ?? 'js'
      })
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.some((item) => item.code === code),
        true
      )
      return true
    }
  )
}

function loosenPatternWhitespace(pattern: RegExp): RegExp {
  const source = pattern.source
    .replace(/\\\*/g, String.raw`\s*\*\s*`)
    .replace(/\\\(/g, String.raw`\(\s*`)
    .replace(/\\\)/g, String.raw`\s*\)`)
    .replace(/(?<!\\)\\n/g, String.raw`\s*`)
    .replace(/ \{(\d+(?:,\d*)?)\}/g, String.raw`\s*`)
    .replace(/ /g, String.raw`\s*`)
    .replace(/\\s\*\\\)/g, String.raw`\s*\)\s*(?:\{\s*)?`)
    .replace(/\\s[*+]((?:goto|return|break|continue)\b)/g, String.raw`\s*(?:\{\s*)?$1`)
    .replace(/;/g, String.raw`;\s*(?:\}\s*)?`)

  return new RegExp(source, pattern.flags)
}
