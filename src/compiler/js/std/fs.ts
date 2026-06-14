import {
  fsGlobalUsagePathForRuntimeMethod,
  isFsPromiseRuntimeMethod,
  isFsSyncRuntimeMethod
} from '../../stdlib/descriptors/fs.ts'
import type { AnyNode } from '../../types.ts'
import type { JsEmitOptions } from '../types.ts'

export type JsExpressionEmitter = (expression: AnyNode, options?: JsEmitOptions) => string

export function emitFsRuntimeConstantExpression(expression: AnyNode): string | null {
  return expression.fsRuntimeConstant == null ? null : `ccjsFsSync.constants.${expression.fsRuntimeConstant}`
}

export function emitFsRuntimeCallExpression(
  expression: AnyNode,
  emitExpression: JsExpressionEmitter,
  options: JsEmitOptions = {}
): string | null {
  const method = expression.fsRuntimeMethod

  if (method == null) {
    return null
  }

  const path = fsGlobalUsagePathForRuntimeMethod(method)

  if (path == null) {
    return null
  }

  if (isFsPromiseRuntimeMethod(method)) {
    return emitFsPromiseRuntimeCallExpression(expression, method, nodeMethodName(path), emitExpression, options)
  }

  if (isFsSyncRuntimeMethod(method)) {
    return emitFsSyncRuntimeCallExpression(expression, method, nodeMethodName(path), emitExpression, options)
  }

  return null
}

function emitFsPromiseRuntimeCallExpression(
  expression: AnyNode,
  method: string,
  nodeMethod: string,
  emitExpression: JsExpressionEmitter,
  options: JsEmitOptions
): string {
  if (['stat', 'lstat', 'realpath', 'readlink'].includes(method)) {
    return `fs.${nodeMethod}(${emitExpression(expression.args[0], options)})`
  }

  if (method === 'readFile') {
    const args =
      expression.args.length === 1
        ? [emitExpression(expression.args[0], options), "'utf8'"]
        : emitArgs(expression.args, emitExpression, options)

    return `fs.${nodeMethod}(${args.join(', ')})`
  }

  if (method === 'readFileBytes') {
    return `fs.${nodeMethod}(${emitExpression(expression.args[0], options)})`
  }

  return `fs.${nodeMethod}(${emitArgs(expression.args, emitExpression, options).join(', ')})`
}

function emitFsSyncRuntimeCallExpression(
  expression: AnyNode,
  method: string,
  nodeMethod: string,
  emitExpression: JsExpressionEmitter,
  options: JsEmitOptions
): string {
  if (['statSync', 'lstatSync', 'realpathSync', 'readlinkSync'].includes(method)) {
    return `ccjsFsSync.${nodeMethod}(${emitExpression(expression.args[0], options)})`
  }

  if (method === 'readFileBytesSync') {
    return `ccjsFsSync.${nodeMethod}(${emitExpression(expression.args[0], options)})`
  }

  return `ccjsFsSync.${nodeMethod}(${emitArgs(expression.args, emitExpression, options).join(', ')})`
}

function emitArgs(args: AnyNode[], emitExpression: JsExpressionEmitter, options: JsEmitOptions): string[] {
  return args.map((arg) => emitExpression(arg, options))
}

function nodeMethodName(path: string[]): string {
  return path[path.length - 1]
}
