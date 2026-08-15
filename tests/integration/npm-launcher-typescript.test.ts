import assert from 'node:assert/strict'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { runCommand } from '../../scripts/lib/run-command.ts'
import { createTestTempDir } from '../helpers/runtime-c.ts'

export async function assertNpmLauncherLoadsTypeScriptFromNodeModules(): Promise<void> {
  const manifest = JSON.parse(await readFile(join(rootDir, 'package.json'), 'utf8')) as {
    bin?: { inox?: string }
    dependencies?: { typescript?: string }
  }
  const tempRoot = await createTestTempDir('npm-launcher-')
  const packageRoot = join(tempRoot, 'node_modules/@inox-cc/inox')
  const launcher = join(packageRoot, 'bin/inox.js')

  assert.equal(manifest.bin?.inox, './bin/inox.js')
  assert.equal(typeof manifest.dependencies?.typescript, 'string')

  try {
    await mkdir(join(packageRoot, 'bin'), { recursive: true })
    await mkdir(join(packageRoot, 'compiler'), { recursive: true })
    await copyFile(join(rootDir, 'bin/inox.js'), launcher)
    await copyFile(join(rootDir, 'package.json'), join(packageRoot, 'package.json'))
    await writeFile(
      join(packageRoot, 'compiler/index.ts'),
      "const message: string = 'TypeScript dependency entrypoint loaded'\n\nconsole.log(message)\n"
    )

    const result = await runCommand(process.execPath, [launcher], tempRoot)

    assert.equal(result.code, 0, `npm launcher failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
    assert.equal(result.stdout, 'TypeScript dependency entrypoint loaded\n')
    assert.equal(result.stderr, '')
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNpmLauncherLoadsTypeScriptFromNodeModules()
}
