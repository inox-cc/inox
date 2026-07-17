import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const forbiddenPatterns = [
  /(?:===|!==)\s*['"]Promise['"]/,
  /['"]Promise['"]\s*(?:===|!==)/,
  /\b(?:checkPromiseStaticCall|checkPromiseMethodCall|checkPromiseConstructorExpression|checkPromiseCallback)\b/,
  /\b(?:resolvePromiseExecutorValueType|collectPromiseExecutorValueTypesFromList|collectPromiseExecutorValueTypesFromNode)\b/,
  /\b(?:isPromiseMethod|promiseStaticMethodName|cPromiseRuntimeCallName|isPromiseConstructorExpression|isPromiseMethodAst)\b/,
  /\b(?:emitPreparedPromiseStaticExpression|emitPreparedPromiseConstructorExpression|emitPreparedPromiseMethodExpression)\b/,
  /\binox::Promise\b/,
  /inox\/promise\.h/,
  /Promise\.(?:resolve|reject|then|catch)/,
  /['"]Promise['"]/,
  /callee\.property === ['"](?:catch|then)['"]/,
  /Promise (?:constructor|resolve|reject|chain|callback)/
]

test('portable compiler не содержит global Promise API semantic tails', async () => {
  const tails: string[] = []

  for (const file of await typescriptFiles(compilerRoot)) {
    const relative = file.slice(projectRoot.length + 1)
    const lines = (await readFile(file, 'utf8')).split('\n')

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
