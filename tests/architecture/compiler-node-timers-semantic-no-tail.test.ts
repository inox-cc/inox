import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'

const compilerRoot = resolve('compiler')
const projectRoot = resolve('.')
const timerApiNames = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate']
const forbiddenPatterns = [
  /stdlib\/node\/timers\/compiler\/(?:c|checker|descriptor|feature)/,
  /\b(?:Timer|timer)(?:RuntimeMethod|LoweringDependencies|HandleMethod|StartCall|ClearCall)\w*\b/,
  /\b(?:check|emit|collect|is|resolve)\w*Timer\w*\b/,
  /\btimersFeature\b/,
  /\bvalueType\s*(?:===|!==)\s*['"]timer['"]/,
  /\binferred\s*(?:===|!==)\s*['"]timer['"]/,
  /\bfeatures\.add\(['"]timers['"]\)/,
  /\binox_timer_handle\b/,
  /\binox_timer_callback_(?:run|finalize)\b/
]

test('portable compiler не содержит semantic tails библиотеки node:timers', async () => {
  const tails: string[] = []

  for (const file of await typescriptFiles(compilerRoot)) {
    const relative = file.slice(projectRoot.length + 1)
    const source = await readFile(file, 'utf8')

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) {
        tails.push(`${relative}: ${pattern.source}`)
      }
    }

    if (source.includes('node:timers')) {
      tails.push(`${relative}: node:timers`)
    }

    for (const name of timerApiNames) {
      if (source.includes(name)) {
        tails.push(`${relative}: ${name}`)
      }
    }
  }

  assert.deepEqual(
    {
      packageCompilerFiles: (await readdir('stdlib/node/timers/compiler')).sort(),
      tails
    },
    {
      packageCompilerFiles: ['index.ts'],
      tails: []
    }
  )
})

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
