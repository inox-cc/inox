import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
const compilerRoot = resolve(projectRoot, 'compiler')
const publicExtensionContract = resolve(compilerRoot, 'extensions/types.ts')

test('stdlib compiler entrypoints depend only on the public compiler extension contract', async () => {
  const entrypoints = await compilerEntrypoints(resolve(projectRoot, 'stdlib'))
  const violations: string[] = []

  for (const entrypoint of entrypoints) {
    const source = await readFile(entrypoint, 'utf8')
    const imports = source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g)

    for (const match of imports) {
      const importedPath = resolve(dirname(entrypoint), match[1])

      if (pathIsInside(importedPath, compilerRoot) && importedPath !== publicExtensionContract) {
        violations.push(
          `${relative(projectRoot, entrypoint)} imports internal compiler module ${relative(projectRoot, importedPath)}`
        )
      }
    }
  }

  assert.deepEqual(violations, [])
})

async function compilerEntrypoints(directory: string): Promise<string[]> {
  const result: string[] = []
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const path = resolve(directory, entry.name)

    if (entry.isDirectory()) {
      result.push(...(await compilerEntrypoints(path)))
    } else if (entry.name === 'index.ts' && dirname(path).endsWith(`${sep}compiler`)) {
      result.push(path)
    }
  }

  return result
}

function pathIsInside(path: string, directory: string): boolean {
  const relativePath = relative(directory, path)

  return relativePath !== '' && relativePath !== '..' && !relativePath.startsWith(`..${sep}`)
}
