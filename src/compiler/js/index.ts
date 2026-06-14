import {
  collectIrPrograms,
  collectIrTopLevelNodeEntries,
  findIrEntryProgram,
  hasIrFunctionDeclaration
} from '../ir.ts'
import type { IrModuleRecord } from '../ir.ts'
import type { AnyNode, IrProgram } from '../types.ts'
import { indent } from './format.ts'
import { emitJsPrelude } from './prelude.ts'
import { emitStatement } from './statements.ts'
import { emitFunctionParams, emitReturnTypeAnnotation, emitTypeAlias } from './types.ts'
import type { JsEmitOptions } from './types.ts'

export function emitJsFromIr(ir: IrProgram, options: JsEmitOptions = {}): string {
  const lines: string[] = emitJsPrelude([ir], options)

  if (lines.length > 0) {
    lines.push('')
  }

  lines.push(...emitProgramBody(ir, options))
  appendMainWrapper(lines, ir, options, true)

  return `${lines.join('\n')}\n`
}

export function emitJsBundleFromIrModules(
  irModules: IrModuleRecord[],
  entry: string,
  options: JsEmitOptions = {}
): string {
  const irPrograms = collectIrPrograms(irModules)
  const entryIr = findIrEntryProgram(irModules, entry)
  const lines: string[] = emitJsPrelude(irPrograms, options)

  if (lines.length > 0) {
    lines.push('')
  }

  for (const module of irModules) {
    lines.push(`// ${module.path}`)
    lines.push(
      ...emitProgramBody(module.ir, {
        ...options,
        stripExports: true
      })
    )
    lines.push('')
  }

  appendMainWrapper(lines, entryIr, options, false)

  return `${lines.join('\n')}\n`
}

function emitProgramBody(ir: IrProgram, options: JsEmitOptions = {}): string[] {
  const lines: string[] = []

  for (const entry of collectIrTopLevelNodeEntries(ir)) {
    if (entry.kind === 'import') {
      continue
    }

    if (entry.kind === 'type') {
      lines.push(...emitTypeAlias(entry.node, options))
    } else if (entry.kind === 'function') {
      lines.push(...emitFunction(entry.node, options))
    } else if (entry.kind === 'class') {
      lines.push(...emitClass(entry.node, options))
    } else {
      lines.push(...emitStatement(entry.node, options))
    }
  }

  return lines
}

function emitFunction(node: AnyNode, options: JsEmitOptions = {}): string[] {
  const exported = node.exported && !options.stripExports
  const head = `${exported ? 'export ' : ''}${node.async ? 'async ' : ''}function ${node.name}(${emitFunctionParams(node.params, options)})${emitReturnTypeAnnotation(node, options)} {`
  const body = node.body.flatMap((statement) => indent(emitStatement(statement, options)))

  return [head, ...body, '}']
}

function emitClass(node: AnyNode, options: JsEmitOptions = {}): string[] {
  const exported = node.exported && !options.stripExports
  const lines = [`${exported ? 'export ' : ''}class ${node.name} {`]

  for (const field of node.fields ?? []) {
    lines.push(...indent([emitClassField(field, options)]))
  }

  for (const method of node.methods) {
    lines.push(...indent(emitMethod(method, options)))
  }

  lines.push('}')

  return lines
}

function emitClassField(field: AnyNode, options: JsEmitOptions = {}): string {
  return field.name
}

function emitMethod(method: AnyNode, options: JsEmitOptions = {}): string[] {
  const returnType = method.name === 'constructor' ? '' : emitReturnTypeAnnotation(method, options)
  const head = `${method.name}(${emitFunctionParams(method.params, options)})${returnType} {`
  const body = method.body.flatMap((statement) => indent(emitStatement(statement, options)))

  return [head, ...body, '}']
}

function appendMainWrapper(
  lines: string[],
  ir: IrProgram,
  options: JsEmitOptions,
  includeSeparator: boolean
): void {
  if (!hasIrFunctionDeclaration(ir, 'main') || options.callMain === false) {
    return
  }

  if (includeSeparator) {
    lines.push('')
  }

  lines.push('const ccjsMainResult = main()')
  lines.push("if (ccjsMainResult && typeof ccjsMainResult.then === 'function') {")
  lines.push('  await ccjsMainResult')
  lines.push('}')
}
