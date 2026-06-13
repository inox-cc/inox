import { checkCCompileBudgets } from './budgets.ts'
import { checkCProfileCapabilities } from './capabilities.ts'
import { emitCBundleFromIrModules, emitCFromIr } from './codegen-c.ts'
import { emitJsBundleFromIrModules, emitJsFromIr } from './codegen-js.ts'
import { checkProgram } from './checker.ts'
import { collectIrModuleRecords, lowerHirToIr } from './ir.ts'
import { tokenize } from './lexer.ts'
import { lowerProgram } from './lower.ts'
import { buildModuleGraph } from './module-graph.ts'
import { parse } from './parser.ts'
import type { CompileOptions, FileCompileResult, SourceCompileResult } from './types.ts'

export function compileSource(source: string, options: CompileOptions = {}): SourceCompileResult {
  const target = options.target ?? 'c'
  const tokens = tokenize(source)
  const ast = parse(tokens)
  const checked = checkProgram(ast)
  const hir = lowerProgram(checked.ast)
  const ir = lowerHirToIr(hir)

  if (target === 'c') {
    checkCProfileCapabilities([ir], options)
    checkCCompileBudgets([ir], options)

    return {
      target,
      ast: checked.ast,
      hir,
      ir,
      code: emitCFromIr(ir, {
        random: options.random
      })
    }
  }

  if (target === 'js') {
    return {
      target,
      ast: checked.ast,
      hir,
      ir,
      code: emitJsFromIr(ir, {
        callMain: options.callMain
      })
    }
  }

  throw new Error(`Unsupported target ${target}`)
}

export async function compileFile(entry: string, options: CompileOptions = {}): Promise<FileCompileResult> {
  const target = options.target ?? 'c'

  if (target === 'c') {
    const graph = await buildModuleGraph(entry)
    const irModules = collectIrModuleRecords(graph)
    checkCProfileCapabilities(
      irModules.map((module) => module.ir),
      options
    )
    checkCCompileBudgets(
      irModules.map((module) => module.ir),
      options
    )

    return {
      target,
      graph,
      code: emitCBundleFromIrModules(irModules, graph.entry, {
        random: options.random
      })
    }
  }

  const graph = await buildModuleGraph(entry)
  const irModules = collectIrModuleRecords(graph)

  if (target === 'js') {
    return {
      target,
      graph,
      code: emitJsBundleFromIrModules(irModules, graph.entry, {
        callMain: options.callMain
      })
    }
  }

  throw new Error(`Unsupported target ${target}`)
}
