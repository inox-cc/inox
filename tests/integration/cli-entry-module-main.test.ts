import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type CommandResult = {
  code: number | null
  stderr: string
  stdout: string
}

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

export async function assertCliEntryModuleMain(): Promise<void> {
  const tempRoot = join(repoRoot, 'dist/test-tmp')

  await mkdir(tempRoot, {
    recursive: true
  })

  const workspace = await mkdtemp(join(tempRoot, 'inox-cli-entry-module-'))
  const sourceDir = join(workspace, 'src')
  const entry = 'src/index.ts'
  const outDir = join(workspace, 'generated')

  try {
    await mkdir(sourceDir, {
      recursive: true
    })
    await mkdir(join(sourceDir, 'lib'), {
      recursive: true
    })
    await writeFile(join(workspace, entry), "import { value } from './lib/value.ts'\nconsole.log(value)\n")
    await writeFile(
      join(sourceDir, 'lib/value.ts'),
      [
        "export const value = 'ok'",
        'function localValue(): string {',
        '  return value',
        '}',
        'export function exportedValue(): string {',
        '  return localValue()',
        '}',
        ''
      ].join('\n')
    )

    const result = await runCommand(
      join(repoRoot, 'dist/inox'),
      [entry, '--emit', 'c', '--out-dir', outDir, '--entry'],
      workspace
    )

    assert.equal(result.code, 0, `driver module emit failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)

    const generated = await readFile(join(outDir, 'src/index.c'), 'utf8')
    const generatedDependency = await readFile(join(outDir, 'src/lib/value.c'), 'utf8')
    const generatedDependencyHeader = await readFile(join(outDir, 'src/lib/value.h'), 'utf8')
    const generatedDeclaration = await readFile(join(outDir, 'src/lib/value.d.ts'), 'utf8')

    assert.match(generated, /int main\(void\)/)
    assert.match(generatedDependency, /inox_mod_src_lib_value_ts_.*_init/)
    assert.match(generatedDependency, /static [^\n]* inox_mod_src_lib_value_ts_.*_localValue\(void\);/)
    assert.doesNotMatch(generatedDependency, /static [^\n]* inox_mod_src_lib_value_ts_.*_exportedValue\(void\);/)
    assert.doesNotMatch(generatedDependencyHeader, /localValue/)
    assert.match(generatedDependencyHeader, /inox_mod_src_lib_value_ts_.*_exportedValue\(void\);/)
    assert.match(generatedDeclaration, /export const value: string;/)
  } finally {
    await rm(workspace, {
      recursive: true,
      force: true
    })
  }
}

async function runCommand(command: string, args: string[], cwd: string): Promise<CommandResult> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout = stdout + chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr = stderr + chunk
    })
    child.on('close', (code) => {
      resolve({
        code,
        stderr,
        stdout
      })
    })
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertCliEntryModuleMain()
}
