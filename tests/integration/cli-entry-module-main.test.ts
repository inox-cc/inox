import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type CommandResult = {
  code: number | null
  stderr: string
  stdout: string
}

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

export async function assertCliEntryModuleMain(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), 'inox-cli-entry-module-'))
  const sourceDir = join(workspace, 'src')
  const entry = 'src/index.ts'
  const outDir = join(workspace, 'generated')

  try {
    await mkdir(sourceDir, {
      recursive: true
    })
    await writeFile(join(workspace, entry), "console.log('ok')\n")

    const result = await runCommand(
      'node',
      [join(repoRoot, 'bin/cli.ts'), entry, '--emit', 'c', '--out-dir', outDir, '--entry'],
      workspace
    )

    assert.equal(result.code, 0, `CLI emit failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)

    const generated = await readFile(join(outDir, 'src/index.c'), 'utf8')

    assert.match(generated, /int main\(void\)/)
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
