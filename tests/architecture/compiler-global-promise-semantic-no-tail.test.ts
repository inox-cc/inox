import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const forbiddenSourcePatterns = [
  /(?:[A-Za-z_$][A-Za-z0-9_$]*\.)*\bcallee\.property\s*(?:===|!==)\s*['"](?:then|catch|resolve|reject)['"]/,
  /['"](?:then|catch|resolve|reject)['"]\s*(?:===|!==)\s*(?:[A-Za-z_$][A-Za-z0-9_$]*\.)*\bcallee\.property\b/
]
const forbiddenPatterns = [
  /(?:^|[^A-Za-z0-9_$])[A-Za-z0-9_$]*[Pp]romise[A-Za-z0-9_$]*(?:$|[^A-Za-z0-9_$])/,
  /['"]promise['"]/,
  /(?:===|!==)\s*['"]Promise['"]/,
  /['"]Promise['"]\s*(?:===|!==)/,
  /\b(?:checkPromiseStaticCall|checkPromiseMethodCall|checkPromiseConstructorExpression|checkPromiseCallback)\b/,
  /\b(?:resolvePromiseExecutorValueType|collectPromiseExecutorValueTypesFromList|collectPromiseExecutorValueTypesFromNode)\b/,
  /\b(?:isPromiseMethod|promiseStaticMethodName|cPromiseRuntimeCallName|isPromiseConstructorExpression|isPromiseMethodAst)\b/,
  /\b(?:emitPreparedPromiseStaticExpression|emitPreparedPromiseConstructorExpression|emitPreparedPromiseMethodExpression)\b/,
  /\binox::Promise\b/,
  /inox\/promise\.h/,
  /\binox_promise(?:_[A-Za-z0-9_]+)?\b/,
  /Promise\.(?:resolve|reject|then|catch)/,
  /['"]Promise['"]/,
  /Promise (?:constructor|resolve|reject|chain|callback)/
]

test('portable compiler не содержит global Promise API semantic tails', async () => {
  const tails: string[] = []

  assert.equal(sourceHasForbiddenMemberComparison("expression.callee.property\n  !== 'then'"), true)
  assert.equal(sourceHasForbiddenMemberComparison("'catch'\n  === expression.callee.property"), true)
  assert.equal(isHostPromiseImplementation('compiler/core.ts', '): Promise<FileCompileResult> {'), true)
  assert.equal(isHostPromiseImplementation('compiler/core.ts', "if (name === 'Promise') {"), false)
  assert.equal(isHostPromiseImplementation('compiler/core.ts', 'return Promise.resolve(value)'), false)
  assert.equal(
    isHostPromiseImplementation('compiler/node-host.ts', 'return Promise.resolve(source)'),
    true
  )

  for (const file of await typescriptFiles(compilerRoot)) {
    const relative = file.slice(projectRoot.length + 1)

    if (/promise/i.test(relative)) {
      tails.push(`${relative}: target Promise terminology in portable file name`)
    }

    const source = await readFile(file, 'utf8')
    const lines = source.split('\n')

    for (const pattern of forbiddenSourcePatterns) {
      if (pattern.test(source)) {
        tails.push(`${relative}: ${pattern.source}`)
      }
    }

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex = lineIndex + 1) {
      const line = lines[lineIndex]

      if (isHostPromiseImplementation(relative, line)) {
        continue
      }

      for (const pattern of forbiddenPatterns) {
        if (pattern.test(line)) {
          tails.push(`${relative}:${lineIndex + 1}: ${pattern.source}`)
        }
      }
    }
  }

  const extensionTypes = await readFile(resolve(compilerRoot, 'extensions/types.ts'), 'utf8')
  const operationKind = extensionTypes.match(
    /export type LibraryAsyncResultOperationKind\s*=([\s\S]*?)(?:\n\n|$)/
  )?.[1]

  assert.ok(operationKind, 'LibraryAsyncResultOperationKind declaration not found')

  for (const oldRole of ['construct', 'resolve', 'then', 'catch']) {
    if (operationKind.includes(`'${oldRole}'`)) {
      tails.push(`compiler/extensions/types.ts: legacy async-result role ${oldRole}`)
    }
  }

  assert.equal(tails.length, 0, tails.join('\n'))
})

function sourceHasForbiddenMemberComparison(source: string): boolean {
  for (const pattern of forbiddenSourcePatterns) {
    if (pattern.test(source)) {
      return true
    }
  }

  return false
}

function isHostPromiseImplementation(relative: string, line: string): boolean {
  if (!line.includes("'") && !line.includes('"')) {
    const withoutTypeReferences = line.replace(/\bPromise<[^<>]+>/g, '')

    if (!/\bPromise\b/.test(withoutTypeReferences)) {
      return true
    }
  }

  return (
    (relative === 'compiler/memory-host.ts' || relative === 'compiler/node-host.ts') &&
    /^\s*return Promise\.(?:resolve|reject)\(/.test(line)
  )
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
