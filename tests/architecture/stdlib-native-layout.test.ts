import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join, relative, resolve } from 'node:path'
import test from 'node:test'

const stdlibRoot = resolve('stdlib')

test('native stdlib использует один package-named .cc и declarations-only headers', async () => {
  const files = await collectFiles(stdlibRoot)
  const sourceDirectories = new Map<string, string[]>()

  for (const file of files) {
    const relativePath = relative(stdlibRoot, file)

    assert.doesNotMatch(relativePath, /_impl(?:\.|$)/)

    if (relativePath.includes('/src/')) {
      const sourceDirectory = relativePath.slice(0, relativePath.indexOf('/src/') + 4)
      const sources = sourceDirectories.get(sourceDirectory) ?? []
      sources.push(file)
      sourceDirectories.set(sourceDirectory, sources)
    }

    if (extname(file) === '.h' || extname(file) === '.hpp') {
      const source = await readFile(file, 'utf8')

      assert.doesNotMatch(source, /\binline\b/, `${relativePath} содержит inline implementation`)
      assert.doesNotMatch(source, /\btemplate\s*</, `${relativePath} содержит template definition`)
      assert.doesNotMatch(
        source,
        /\)\s*(?:const\s*)?(?:noexcept(?:\([^)]*\))?\s*)?(?:->\s*[^{};]+\s*)?\{/,
        `${relativePath} содержит function body`
      )
      assert.doesNotMatch(source, /\]\s*(?:\([^)]*\)\s*)?\{/, `${relativePath} содержит lambda body`)
    }
  }

  for (const [sourceDirectory, sources] of sourceDirectories) {
    const packageDirectory = sourceDirectory.slice(0, -'/src'.length)
    const expectedSource = join(stdlibRoot, packageDirectory, 'src', `${basename(packageDirectory)}.cc`)

    assert.deepEqual(sources.sort(), [expectedSource])
  }
})

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)))
    } else if (entry.isFile()) {
      files.push(path)
    }
  }

  return files
}
