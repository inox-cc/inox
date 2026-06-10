import { emitCBundle, emitCFromIr } from './codegen-c.ts'
import { emitJsBundle, emitJsFromIr, emitTsBundle, emitTsFromIr } from './codegen-js.ts'
import { checkProgram } from './checker.ts'
import { lowerHirToIr } from './ir.ts'
import { tokenize } from './lexer.ts'
import { lowerProgram } from './lower.ts'
import { buildModuleGraph } from './module-graph.ts'
import { parse } from './parser.ts'
import type { CompileOptions, FileCompileResult, SourceCompileResult } from './types.ts'

export function compileSource(source: string, options: CompileOptions = {}): SourceCompileResult {
  const target = options.target ?? 'js'
  const tokens = tokenize(source)
  const ast = parse(tokens)
  const checked = checkProgram(ast)
  const hir = lowerProgram(checked.ast)
  const ir = lowerHirToIr(hir)

  if (target === 'c') {
    return {
      target,
      ast: checked.ast,
      hir,
      ir,
      code: emitCFromIr(ir)
    }
  }

  if (target === 'ts') {
    return {
      target,
      ast: checked.ast,
      hir,
      ir,
      code: emitTsFromIr(ir, {
        callMain: options.callMain
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
  const target = options.target ?? 'js'

  if (target === 'c') {
    const graph = await buildModuleGraph(entry)

    return {
      target,
      graph,
      code: emitCBundle(graph)
    }
  }

  const graph = await buildModuleGraph(entry)

  if (target === 'js') {
    return {
      target,
      graph,
      code: emitJsBundle(graph, {
        callMain: options.callMain
      })
    }
  }

  if (target === 'ts') {
    return {
      target,
      graph,
      code: emitTsBundle(graph, {
        callMain: options.callMain
      })
    }
  }

  throw new Error(`Unsupported target ${target}`)
}
