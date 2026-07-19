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

  for (const file of await typescriptFiles(compilerRoot)) {
    const relative = file.slice(projectRoot.length + 1)
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
  return (
    (relative === 'compiler/memory-host.ts' || relative === 'compiler/node-host.ts') &&
    (line.includes('Promise.resolve') || line.includes('Promise.reject'))
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
