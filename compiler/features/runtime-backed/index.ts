import { memberExpressionPath } from '../../member-paths.ts'
import { binaryConstructorNameFromPath } from '../../stdlib/descriptors/binary.ts'
import { debugRuntimeMethodNameFromPath } from '../../stdlib/descriptors/debug.ts'
import { fsRuntimeMethodForPath } from '../../stdlib/descriptors/fs.ts'
import { jsonRuntimeMethodNameFromPath } from '../../stdlib/descriptors/json.ts'
import {
  dateConstructorRuntimeMethodNameFromPath,
  dateInstanceRuntimeMethodName,
  dateInstanceRuntimeMethodReturnType,
  timeRuntimeMethodNameFromPath
} from '../../stdlib/descriptors/time.ts'
import { timerRuntimeMethodNameFromPath } from '../../stdlib/descriptors/timers.ts'
import type { AnyNode, IrFeature, IrRuntimeRequirement } from '../../types.ts'

type RuntimeBackedFeatureSet = Set<IrFeature>
type RuntimeBackedCPreludeHelper = () => string[]

type RuntimeBackedFeatureNode = AnyNode & {
  binaryRuntimeMethod?: string | null
  callee?: AnyNode | null
  childProcessRuntimeMethod?: string | null
  cryptoRuntimeMethod?: string | null
  debugRuntimeMethod?: string | null
  fsRuntimeConstant?: string | null
  fsRuntimeMethod?: string | null
  osRuntimeConstant?: string | null
  osRuntimeMethod?: string | null
  path?: string[]
  pathRuntimeConstant?: string | null
  pathRuntimeMethod?: string | null
  processRuntimeEnvName?: string | null
  processRuntimeMethod?: string | null
  processRuntimeProperty?: string | null
  property?: string | null
  returnType?: string | null
  timeRuntimeMethod?: string | null
  timerRuntimeMethod?: string | null
  type?: string | null
  urlRuntimeMethod?: string | null
  valueType?: string | null
}

export const binaryFeatureId: IrFeature = 'binary'
export const childProcessFeatureId: IrFeature = 'child-process'
export const clocksFeatureId: IrFeature = 'clocks'
export const cryptoFeatureId: IrFeature = 'crypto'
export const debugMemoryFeatureId: IrFeature = 'debug-memory'
export const fsFeatureId: IrFeature = 'fs'
export const jsonFeatureId: IrFeature = 'json'
export const osFeatureId: IrFeature = 'os'
export const pathFeatureId: IrFeature = 'path'
export const processFeatureId: IrFeature = 'process'
export const timersFeatureId: IrFeature = 'timers'
export const urlFeatureId: IrFeature = 'url'

export const binaryFeatureRuntimeRequirements: IrRuntimeRequirement[] = ['binary', 'managed-values']
export const childProcessFeatureRuntimeRequirements: IrRuntimeRequirement[] = [
  'child-process',
  'managed-values',
  'string-bytes'
]
export const clocksFeatureRuntimeRequirements: IrRuntimeRequirement[] = ['clocks']
export const cryptoFeatureRuntimeRequirements: IrRuntimeRequirement[] = ['binary', 'crypto', 'managed-values']
export const debugMemoryFeatureRuntimeRequirements: IrRuntimeRequirement[] = [
  'debug-memory',
  'managed-values',
  'objects'
]
export const fsFeatureRuntimeRequirements: IrRuntimeRequirement[] = [
  'async-runtime',
  'collections',
  'fs',
  'managed-values'
]
export const jsonFeatureRuntimeRequirements: IrRuntimeRequirement[] = [
  'collections',
  'json',
  'managed-values',
  'objects',
  'string-bytes'
]
export const osFeatureRuntimeRequirements: IrRuntimeRequirement[] = ['managed-values', 'os', 'string-bytes']
export const pathFeatureRuntimeRequirements: IrRuntimeRequirement[] = ['managed-values', 'path', 'string-bytes']
export const processFeatureRuntimeRequirements: IrRuntimeRequirement[] = [
  'managed-values',
  'process',
  'string-bytes'
]
export const timersFeatureRuntimeRequirements: IrRuntimeRequirement[] = [
  'async-runtime',
  'callback-values',
  'managed-values',
  'timers'
]
export const urlFeatureRuntimeRequirements: IrRuntimeRequirement[] = [
  'managed-values',
  'objects',
  'string-bytes',
  'url'
]

export const binaryFeatureCPreludeIncludes: string[] = []
export const childProcessFeatureCPreludeIncludes: string[] = []
export const clocksFeatureCPreludeIncludes: string[] = []
export const cryptoFeatureCPreludeIncludes: string[] = []
export const debugMemoryFeatureCPreludeIncludes: string[] = []
export const fsFeatureCPreludeIncludes: string[] = []
export const jsonFeatureCPreludeIncludes: string[] = []
export const osFeatureCPreludeIncludes: string[] = []
export const pathFeatureCPreludeIncludes: string[] = []
export const processFeatureCPreludeIncludes: string[] = []
export const timersFeatureCPreludeIncludes: string[] = []
export const urlFeatureCPreludeIncludes: string[] = []

export const binaryFeatureCPreludeHelpers: RuntimeBackedCPreludeHelper[] = []
export const childProcessFeatureCPreludeHelpers: RuntimeBackedCPreludeHelper[] = []
export const clocksFeatureCPreludeHelpers: RuntimeBackedCPreludeHelper[] = []
export const cryptoFeatureCPreludeHelpers: RuntimeBackedCPreludeHelper[] = []
export const debugMemoryFeatureCPreludeHelpers: RuntimeBackedCPreludeHelper[] = []
export const fsFeatureCPreludeHelpers: RuntimeBackedCPreludeHelper[] = []
export const jsonFeatureCPreludeHelpers: RuntimeBackedCPreludeHelper[] = []
export const osFeatureCPreludeHelpers: RuntimeBackedCPreludeHelper[] = []
export const pathFeatureCPreludeHelpers: RuntimeBackedCPreludeHelper[] = []
export const processFeatureCPreludeHelpers: RuntimeBackedCPreludeHelper[] = []
export const timersFeatureCPreludeHelpers: RuntimeBackedCPreludeHelper[] = []
export const urlFeatureCPreludeHelpers: RuntimeBackedCPreludeHelper[] = []

export function collectRuntimeBackedIrFeature(
  featureName: IrFeature,
  node: AnyNode,
  features: RuntimeBackedFeatureSet
): boolean {
  const item = node as RuntimeBackedFeatureNode

  if (featureName === binaryFeatureId) {
    collectBinaryIrFeatures(item, features)
    return true
  }

  if (featureName === childProcessFeatureId) {
    collectChildProcessIrFeatures(item, features)
    return true
  }

  if (featureName === clocksFeatureId) {
    collectClocksIrFeatures(item, features)
    return true
  }

  if (featureName === cryptoFeatureId) {
    collectCryptoIrFeatures(item, features)
    return true
  }

  if (featureName === debugMemoryFeatureId) {
    collectDebugMemoryIrFeatures(item, features)
    return true
  }

  if (featureName === fsFeatureId) {
    collectFsIrFeatures(item, features)
    return true
  }

  if (featureName === jsonFeatureId) {
    collectJsonIrFeatures(item, features)
    return true
  }

  if (featureName === osFeatureId) {
    collectOsIrFeatures(item, features)
    return true
  }

  if (featureName === pathFeatureId) {
    collectPathIrFeatures(item, features)
    return true
  }

  if (featureName === processFeatureId) {
    collectProcessIrFeatures(item, features)
    return true
  }

  if (featureName === timersFeatureId) {
    collectTimersIrFeatures(item, features)
    return true
  }

  if (featureName === urlFeatureId) {
    collectUrlIrFeatures(item, features)
    return true
  }

  return false
}

function collectBinaryIrFeatures(node: RuntimeBackedFeatureNode, features: RuntimeBackedFeatureSet): void {
  if (node.valueType === 'bytes' || node.returnType === 'bytes') {
    features.add('binary')
    features.add('runtime-values')
  }

  if (isBinaryConstructorExpression(node)) {
    features.add('binary')
    features.add('runtime-values')
  }

  if (binaryRuntimeMethodName(node)) {
    features.add('binary')
    features.add('runtime-values')
  }
}

function collectChildProcessIrFeatures(node: RuntimeBackedFeatureNode, features: RuntimeBackedFeatureSet): void {
  if (!childProcessRuntimeMethodName(node)) {
    return
  }

  features.add('child-process')
  features.add('runtime-values')
  features.add('string-bytes')
}

function collectClocksIrFeatures(node: RuntimeBackedFeatureNode, features: RuntimeBackedFeatureSet): void {
  if (!isCallLikeNode(node)) {
    return
  }

  const call = clocksRuntimeCallName(node)

  if (call === null || typeof call === 'undefined') {
    return
  }

  features.add('clocks')

  if (dateInstanceRuntimeMethodReturnType(call) === 'string') {
    features.add('runtime-values')
    features.add('string-bytes')
  }

  if (call === 'sleep') {
    features.add('runtime-values')
  }
}

function collectCryptoIrFeatures(node: RuntimeBackedFeatureNode, features: RuntimeBackedFeatureSet): void {
  if (!cryptoRuntimeMethodName(node)) {
    return
  }

  features.add('crypto')
  features.add('runtime-values')
}

function collectDebugMemoryIrFeatures(node: RuntimeBackedFeatureNode, features: RuntimeBackedFeatureSet): void {
  if (!debugRuntimeMethodName(node)) {
    return
  }

  features.add('debug-memory')
  features.add('objects')
  features.add('runtime-values')
}

function collectFsIrFeatures(node: RuntimeBackedFeatureNode, features: RuntimeBackedFeatureSet): void {
  if (node.type === 'MemberExpression' && hasValue(node.fsRuntimeConstant)) {
    features.add('fs')
  }

  if (!fsRuntimeMethodName(node)) {
    return
  }

  features.add('fs')
}

function collectJsonIrFeatures(node: RuntimeBackedFeatureNode, features: RuntimeBackedFeatureSet): void {
  if (!jsonRuntimeCallName(node)) {
    return
  }

  features.add('json')
  features.add('runtime-values')
}

function collectOsIrFeatures(node: RuntimeBackedFeatureNode, features: RuntimeBackedFeatureSet): void {
  if (!hasValue(node.osRuntimeMethod) && !hasValue(node.osRuntimeConstant)) {
    return
  }

  features.add('os')
  features.add('runtime-values')
}

function collectPathIrFeatures(node: RuntimeBackedFeatureNode, features: RuntimeBackedFeatureSet): void {
  if (!hasValue(node.pathRuntimeConstant) && !pathRuntimeMethodName(node)) {
    return
  }

  features.add('path')
  features.add('runtime-values')
  features.add('string-bytes')
}

function collectProcessIrFeatures(node: RuntimeBackedFeatureNode, features: RuntimeBackedFeatureSet): void {
  if (!hasValue(node.processRuntimeProperty) && !hasValue(node.processRuntimeEnvName) && !processRuntimeMethodName(node)) {
    return
  }

  features.add('process')
  features.add('runtime-values')
  features.add('string-bytes')
}

function collectTimersIrFeatures(node: RuntimeBackedFeatureNode, features: RuntimeBackedFeatureSet): void {
  if (!timerRuntimeCallName(node)) {
    return
  }

  features.add('timers')
}

function collectUrlIrFeatures(node: RuntimeBackedFeatureNode, features: RuntimeBackedFeatureSet): void {
  if (!urlRuntimeMethodName(node)) {
    return
  }

  features.add('url')
  features.add('runtime-values')
  features.add('string-bytes')
}

function hasValue(value: string | null | undefined): boolean {
  return value !== null && typeof value !== 'undefined'
}

function isCallLikeNode(node: RuntimeBackedFeatureNode): boolean {
  return node.type === 'CallExpression' || node.type === 'OptionalCallExpression' || node.type === 'NewExpression'
}

function isBinaryConstructorExpression(expression: RuntimeBackedFeatureNode): boolean {
  return expression.type === 'NewExpression' && binaryConstructorName(expression) !== null
}

function binaryConstructorName(expression: RuntimeBackedFeatureNode): string | null {
  const calleePath = simpleReferencePath(expression.callee)

  if (calleePath === null || typeof calleePath === 'undefined') {
    return null
  }

  return binaryConstructorNameFromPath(calleePath)
}

function binaryRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const callee = expression.callee
  const method = nullableString(expression.binaryRuntimeMethod)

  if (
    expression.type !== 'CallExpression' ||
    callee === null ||
    typeof callee === 'undefined' ||
    callee.type !== 'MemberExpression'
  ) {
    return null
  }

  if (method !== null && typeof method !== 'undefined') {
    return method
  }

  return null
}

function childProcessRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const method = nullableString(expression.childProcessRuntimeMethod)

  if (expression.type !== 'CallExpression' || method === null || typeof method === 'undefined') {
    return null
  }

  return method
}

function clocksRuntimeCallName(expression: RuntimeBackedFeatureNode): string | null {
  const directCall = nullableString(expression.timeRuntimeMethod)
  const callee = expression.callee

  if (directCall !== null && typeof directCall !== 'undefined') {
    return directCall
  }

  if (callee === null || typeof callee === 'undefined') {
    return null
  }

  const timeCall = timeRuntimeCallName(callee)

  if (timeCall !== null && typeof timeCall !== 'undefined') {
    return timeCall
  }

  return dateReceiverRuntimeMethodName(callee)
}

function cryptoRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const method = nullableString(expression.cryptoRuntimeMethod)

  if (expression.type !== 'CallExpression' || method === null || typeof method === 'undefined') {
    return null
  }

  return method
}

function debugRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const callee = expression.callee
  const method = nullableString(expression.debugRuntimeMethod)

  if (
    expression.type !== 'CallExpression' ||
    callee === null ||
    typeof callee === 'undefined' ||
    callee.type !== 'MemberExpression' ||
    method === null ||
    typeof method === 'undefined'
  ) {
    return null
  }

  if (debugRuntimeMethodNameFromPath(memberExpressionPath(callee)) === method) {
    return method
  }

  return null
}

function fsRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const method = nullableString(expression.fsRuntimeMethod)

  if (expression.type !== 'CallExpression') {
    return null
  }

  if (method !== null && typeof method !== 'undefined') {
    return method
  }

  return fsRuntimeMethodForPath(memberExpressionPath(expression.callee))
}

function jsonRuntimeCallName(expression: RuntimeBackedFeatureNode): string | null {
  const callee = expression.callee

  if (!isCallLikeNode(expression) || callee === null || typeof callee === 'undefined') {
    return null
  }

  return jsonRuntimeMethodNameFromPath(memberExpressionPath(callee))
}

function pathRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const method = nullableString(expression.pathRuntimeMethod)

  if (expression.type !== 'CallExpression' || method === null || typeof method === 'undefined') {
    return null
  }

  return method
}

function processRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const method = nullableString(expression.processRuntimeMethod)

  if (expression.type !== 'CallExpression' || method === null || typeof method === 'undefined') {
    return null
  }

  return method
}

function timeRuntimeCallName(callee: AnyNode): string | null {
  const path = memberExpressionPath(callee)
  const method = timeRuntimeMethodNameFromPath(path)

  if (method !== null && typeof method !== 'undefined') {
    return method
  }

  return dateConstructorRuntimeMethodNameFromPath(path)
}

function dateReceiverRuntimeMethodName(callee: AnyNode): string | null {
  if (callee.type !== 'MemberExpression') {
    return null
  }

  const receiver = callee.object

  if (receiver === null || typeof receiver === 'undefined' || receiver.valueType !== 'date') {
    return null
  }

  return dateInstanceRuntimeMethodName(callee.property)
}

function timerRuntimeCallName(expression: RuntimeBackedFeatureNode): string | null {
  const method = nullableString(expression.timerRuntimeMethod)

  if (expression.type === 'CallExpression' && method !== null && typeof method !== 'undefined') {
    return method
  }

  const calleePath = simpleReferencePath(expression.callee)

  if (calleePath === null || typeof calleePath === 'undefined') {
    return null
  }

  return timerRuntimeMethodNameFromPath(calleePath)
}

function urlRuntimeMethodName(expression: RuntimeBackedFeatureNode): string | null {
  const method = nullableString(expression.urlRuntimeMethod)

  if (
    (expression.type !== 'CallExpression' && expression.type !== 'NewExpression') ||
    method === null ||
    typeof method === 'undefined'
  ) {
    return null
  }

  return method
}

function simpleReferencePath(expression: AnyNode | null | undefined): string[] | null {
  if (expression === null || typeof expression === 'undefined' || expression.type !== 'Reference') {
    return null
  }

  const path = expression.path

  if (path === null || typeof path === 'undefined' || path.length !== 1) {
    return null
  }

  return path
}

function nullableString(value: string | null | undefined): string | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  return value
}
