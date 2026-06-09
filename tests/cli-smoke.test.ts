import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const cliPath = join(repoRoot, 'bin/ccjs.ts')

type CommandResult = {
  code: number
  stdout: string
  stderr: string
}

type RunOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
}

test('ccjs file compiles and runs on the fly', async () => {
  const result = await runCli(['tests/fixtures/parser/valid/hello.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'hello\n')
  assert.equal(result.stderr, '')
})

test('ccjs accepts valid TypeScript files as canonical source input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-ts-cli-'))
  const entry = join(dir, 'main.ts')

  try {
    await writeFile(entry, `export function main(): void {
  const name: string = 'Ada'
  console.log(\`hello \${name}\`)
}
`)

    const result = await runCli([entry])

    assert.equal(result.code, 0)
    assert.equal(result.stdout, 'hello Ada\n')
    assert.equal(result.stderr, '')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs file --emit c writes C source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-test-'))
  const out = join(dir, 'hello.c')

  try {
    const result = await runCli(['tests/fixtures/parser/valid/hello.ts', '--emit', 'c', '-o', out])

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const c = await readFile(out, 'utf8')
    assert.match(c, /int main\(void\)/)
    assert.match(c, /printf\("%s\\n", "hello"\);/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs module graph --emit c writes bundled C source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-test-'))
  const out = join(dir, 'modules.c')

  try {
    const result = await runCli(['tests/fixtures/modules/basic/main.js', '--emit', 'c', '-o', out])

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const c = await readFile(out, 'utf8')
    assert.match(c, /void greet\(void\);/)
    assert.match(c, /void ccjs_main\(void\);/)
    assert.match(c, /greet\(\);/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs build --target c writes a native executable', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-test-'))
  const out = join(dir, 'hello')

  try {
    const result = await runCli(['build', 'tests/fixtures/parser/valid/hello.ts', '--target', 'c', '-o', out])

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)
    assert.equal(result.stderr, '')

    const run = await runCommand(out, [])

    assert.equal(run.code, 0)
    assert.equal(run.stdout, 'hello\n')
    assert.equal(run.stderr, '')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs build --target c uses CC compiler override', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-test-'))
  const out = join(dir, 'hello')
  const wrapper = join(dir, 'cc-wrapper.sh')
  const log = join(dir, 'cc.log')

  try {
    await writeFile(wrapper, `#!/bin/sh
printf '<%s>\\n' "$0" "$@" > "$CCJS_CC_LOG"
exec cc "$@"
`)
    await chmod(wrapper, 0o755)

    const result = await runCli(['build', 'tests/fixtures/parser/valid/hello.ts', '--target', 'c', '-o', out], {
      env: {
        CC: wrapper,
        CFLAGS: '"-Inonexistent path with spaces" -DCCJS_TEST_CFLAG=1',
        LDFLAGS: "'-Llinker path with spaces' -DCCJS_TEST_LDFLAG=1",
        CCJS_CC_LOG: log
      }
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const invocation = await readFile(log, 'utf8')
    const run = await runCommand(out, [])

    assert.match(invocation, new RegExp(escapeRegExp(wrapper)))
    assert.match(invocation, /<-Inonexistent path with spaces>/)
    assert.match(invocation, /-DCCJS_TEST_CFLAG=1/)
    assert.match(invocation, /<-Llinker path with spaces>/)
    assert.match(invocation, /-DCCJS_TEST_LDFLAG=1/)
    assert.equal(run.code, 0)
    assert.equal(run.stdout, 'hello\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs build --target c reads ccjs.config.json toolchain settings', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-config-test-'))
  const out = join(dir, 'hello')
  const wrapper = join(dir, 'cc-wrapper.sh')
  const log = join(dir, 'cc.log')

  try {
    await writeFile(join(dir, 'main.ts'), `export function main(): void {
  console.log('hello')
}
`)
    await writeFile(wrapper, `#!/bin/sh
printf '<%s>\\n' "$0" "$@" > "$CCJS_CC_LOG"
exec cc "$@"
`)
    await chmod(wrapper, 0o755)
    await writeFile(join(dir, 'ccjs.config.json'), `${JSON.stringify({
      c: {
        cc: wrapper,
        cflags: ['-Inonexistent config path with spaces', '-DCCJS_CONFIG_CFLAG=1'],
        ldflags: ['-Llinker config path with spaces', '-DCCJS_CONFIG_LDFLAG=1']
      }
    }, null, 2)}\n`)

    const result = await runCli(['build', 'main.ts', '--target', 'c', '-o', out], {
      cwd: dir,
      env: {
        CCJS_CC_LOG: log
      }
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const invocation = await readFile(log, 'utf8')
    const run = await runCommand(out, [])

    assert.match(invocation, new RegExp(escapeRegExp(wrapper)))
    assert.match(invocation, /<-Inonexistent config path with spaces>/)
    assert.match(invocation, /-DCCJS_CONFIG_CFLAG=1/)
    assert.match(invocation, /<-Llinker config path with spaces>/)
    assert.match(invocation, /-DCCJS_CONFIG_LDFLAG=1/)
    assert.equal(run.code, 0)
    assert.equal(run.stdout, 'hello\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs build --target c reports invalid ccjs.config.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-config-test-'))

  try {
    await writeFile(join(dir, 'main.ts'), `export function main(): void {
  console.log('hello')
}
`)
    await writeFile(join(dir, 'ccjs.config.json'), `${JSON.stringify({
      c: {
        cflags: [1]
      }
    }, null, 2)}\n`)

    const result = await runCli(['build', 'main.ts', '--target', 'c'], {
      cwd: dir
    })

    assert.equal(result.code, 1)
    assert.match(result.stderr, /invalid ccjs\.config\.json: c\.cflags must be a string or an array of strings/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs run --target c builds and runs a temporary native executable', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const result = await runCli(['run', 'tests/fixtures/parser/valid/hello.ts', '--target', 'c'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'hello\n')
  assert.equal(result.stderr, '')
})

test('ccjs run --target c runs a module graph with import aliases', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const result = await runCli(['run', 'tests/fixtures/modules/alias/main.ts', '--target', 'c'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'from alias\n')
  assert.equal(result.stderr, '')
})

test('ccjs run --target c runs a module graph with type imports', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const result = await runCli(['run', 'tests/fixtures/modules/type-import/main.ts', '--target', 'c'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'Ada\n')
  assert.equal(result.stderr, '')
})

test('ccjs run --target c resolves directory index imports', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const result = await runCli(['run', 'tests/fixtures/modules/index-import/main.ts', '--target', 'c'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'from index\n')
  assert.equal(result.stderr, '')
})

test('ccjs run --target c --keep keeps temporary C artifacts', async t => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const result = await runCli(['run', 'tests/fixtures/parser/valid/hello.ts', '--target', 'c', '--keep'])
  const match = result.stderr.match(/kept (.+)\n?$/)

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'hello\n')
  assert.ok(match)

  const dir = match[1]

  try {
    const c = await readFile(join(dir, 'main.c'), 'utf8')
    const run = await runCommand(join(dir, 'main'), [])

    assert.match(c, /int main\(void\)/)
    assert.equal(run.code, 0)
    assert.equal(run.stdout, 'hello\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs run --keep writes temporary js output', async () => {
  const result = await runCli(['tests/fixtures/parser/valid/hello.ts', '--keep'])
  const match = result.stderr.match(/kept (.+)\n?$/)

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'hello\n')
  assert.ok(match)

  const dir = match[1]

  try {
    const js = await readFile(join(dir, 'main.js'), 'utf8')
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))

    assert.match(js, /function main\(\)/)
    assert.equal(pkg.type, 'module')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs reports diagnostics for invalid source', async () => {
  const result = await runCli(['tests/fixtures/diagnostics/no-var.ts'])

  assert.equal(result.code, 1)
  assert.match(result.stderr, /CCJS_NO_VAR/)
})

test('ccjs file runs a multi-file module graph', async () => {
  const result = await runCli(['tests/fixtures/modules/basic/main.js'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'from module\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs a module graph with import aliases', async () => {
  const result = await runCli(['tests/fixtures/modules/alias/main.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'from alias\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs a module graph with type imports', async () => {
  const result = await runCli(['tests/fixtures/modules/type-import/main.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'Ada\n')
  assert.equal(result.stderr, '')
})

test('ccjs file resolves directory index imports', async () => {
  const result = await runCli(['tests/fixtures/modules/index-import/main.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'from index\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs composite expressions', async () => {
  const result = await runCli(['tests/fixtures/runtime/composite-expressions.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'Grace 5 true\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs if else blocks', async () => {
  const result = await runCli(['tests/fixtures/runtime/if-else.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'yes\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs while loops', async () => {
  const result = await runCli(['tests/fixtures/runtime/while.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, '6\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs classic for loops', async () => {
  const result = await runCli(['tests/fixtures/runtime/for.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, '6\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs continue statements', async () => {
  const result = await runCli(['tests/fixtures/runtime/continue.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, '8\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs for of loops', async () => {
  const result = await runCli(['tests/fixtures/runtime/for-of.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, '6\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs switch statements', async () => {
  const result = await runCli(['tests/fixtures/runtime/switch.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'two\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs callbacks', async () => {
  const result = await runCli(['tests/fixtures/runtime/callback.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'callback\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs optional chaining', async () => {
  const result = await runCli(['tests/fixtures/runtime/optional-chaining.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'Ada undefined called\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs nullish coalescing', async () => {
  const result = await runCli(['tests/fixtures/runtime/nullish-coalescing.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'Ada Grace\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs try catch finally', async () => {
  const result = await runCli(['tests/fixtures/runtime/try-catch.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'caught boom\nfinally\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs simple classes', async () => {
  const result = await runCli(['tests/fixtures/runtime/class.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'Ada\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs async await', async () => {
  const result = await runCli(['tests/fixtures/runtime/async-await.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, '2\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs arrow function chains', async () => {
  const result = await runCli(['tests/fixtures/runtime/arrow-chain.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, '4 6\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs JS stdlib globals', async () => {
  const result = await runCli(['tests/fixtures/runtime/js-stdlib.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'true true\ntrue 42\nhello Ada\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs fetch and timers', async () => {
  const result = await runCli(['tests/fixtures/runtime/fetch-timers.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'hello\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs fs globals', async () => {
  const result = await runCli(['tests/fixtures/runtime/fs.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'hello fs\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs JSON and binary globals', async () => {
  const result = await runCli(['tests/fixtures/runtime/json-binary.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'Ada true 2 3 3\n')
  assert.equal(result.stderr, '')
})

function runCli(args: string[], options: RunOptions = {}): Promise<CommandResult> {
  return runCommand(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    env: options.env == null ? undefined : {
      ...process.env,
      ...options.env
    }
  })
}

function runCommand(command: string, args: string[], options: RunOptions = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += chunk
    })

    child.stderr.on('data', chunk => {
      stderr += chunk
    })

    child.on('error', reject)
    child.on('exit', code => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      })
    })
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
