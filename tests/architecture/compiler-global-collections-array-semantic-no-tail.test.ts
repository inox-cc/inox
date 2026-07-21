import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const forbiddenMemberNames =
  'length|includes|join|push|unshift|pop|slice|size|get|set|has|delete|clear|keys|values|entries|add'
const forbiddenPatterns = [
  /\barrayElementType\b/,
  /\barrayElementDeclaredType\b/,
  /\barrayElementFunctionType\b/,
  /\barrayElementShape\b/,
  /\breturnArrayElementType\b/,
  /\breturnArrayElementDeclaredType\b/,
  /\breturnArrayElementFunctionType\b/,
  /\bcppArrayValues\b/,
  /\bneedsArrayRuntime\b/,
  /\barrayIsArrayCall\b/,
  /\bloweredArrayMethod(?:Name)?\b/,
  /\b(?:checkArrayMethodCall|checkArrayFromCall|checkArrayIsArrayCall|emitPreparedArrayFromCallExpression|emitPreparedArrayIsArrayCallExpression|isArrayFromCall|isArrayIsArrayCall|isArrayMethodCall|arrayRuntimeMethodName)\b/,
  /\b(?:isArrayIncludesCall|isArrayJoinCall|isArrayUnshiftCall|isArrayLengthExpression|resolveKnownArrayLength)\b/,
  /\bemit(?:Prepared)?Array(?:Length|Slice|Join|Includes|Push|Unshift|Pop)(?:Call)?Expression\b/,
  new RegExp(`\\.property\\s*(?:===|!==)\\s*['"](?:${forbiddenMemberNames})['"]`),
  new RegExp(`['"](?:${forbiddenMemberNames})['"]\\s*(?:===|!==)\\s*[^\\n]*\\.property`),
  /\bArrayClass\b/,
  /\bArrayStorage\b/,
  /\b(?:CArrayElementInfo|CKnownArrayElement|CRuntimeArrayElement)\b/,
  /\b(?:arrayShapes|arrayLengths|runtimeArrayElementTypes)\b/,
  /\b(?:resolveKnownArrayIndex|resolveKnownForOfArray|resolveRuntimeArrayIndex|resolveRuntimeForOfArray)\b/,
  /\b(?:resultArrayElementType|resultArrayElementTypeId|arrayElementTypeId)\b/,
  /\b(?:runtimeArray|RuntimeArray)[A-Za-z0-9_$]*\b/,
  /\b(?:ArrayFunctionContext|ArrayLoweringDependencies|arrayLoweringDependencies)\b/,
  /\b(?:CollectionFunctionContext|CollectionLoweringDependencies|collectionKind)\b/,
  /\bINOX_TAG_(?:ARRAY|MAP|SET)\b/,
  /\b(?:valueType|returnType|elementType|inferred|expected|actual)\s*(?:===|!==)\s*['"]array['"]/,
  /['"]array['"]\s*(?:===|!==)\s*\b(?:valueType|returnType|elementType|inferred|expected|actual)\b/,
  /\bneedsCollectionRuntime\b/,
  /['"]collections['"]/,
  /['"](?:Array|Map|Set)['"]/,
  /\b(?:check|emit(?:Prepared)?|is|resolveKnown|resolveRuntime)(?:Map|Set)(?:Constructor|Method|Call|Expression|Index|Iteration|Entry|Value)[A-Za-z0-9_$]*\b/,
  /\b(?:Map|Set)(?:Class|Storage|FunctionContext|LoweringDependencies|ElementInfo|Runtime)\b/,
  /\binox::(?:Map|Set)\b/,
  /inox\/(?:array|map|set)\.h/,
  /['"]global:collections#(?:map|set)['"]/
]

test('portable compiler не содержит target collection semantic tails', async () => {
  const tails: string[] = []

  assert.equal(existsSync(resolve(compilerRoot, 'c/values/arrays.ts')), false)
  assert.equal(sourceHasForbiddenCollectionTail("expression.property === 'size'"), true)
  assert.equal(sourceHasForbiddenCollectionTail("'add' !== expression.property"), true)
  assert.equal(sourceHasForbiddenCollectionTail("globals.has('Map')"), true)
  assert.equal(sourceHasForbiddenCollectionTail('const values = new Map<string, number>()'), false)

  for (const file of await typescriptFiles(compilerRoot)) {
    const relative = file.slice(projectRoot.length + 1)
    const source = await readFile(file, 'utf8')

    const pattern = firstForbiddenCollectionPattern(source)

    if (pattern !== null) {
      tails.push(`${relative}: ${pattern.source}`)
    }
  }

  assert.deepEqual(tails, [])
})

function sourceHasForbiddenCollectionTail(source: string): boolean {
  return firstForbiddenCollectionPattern(source) !== null
}

function firstForbiddenCollectionPattern(source: string): RegExp | null {
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      return pattern
    }
  }

  return null
}

async function typescriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const path = resolve(root, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await typescriptFiles(path)))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path)
    }
  }

  return files
}
