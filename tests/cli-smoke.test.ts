import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const cliPath = join(repoRoot, 'bin/inox.ts')

type CommandResult = {
  code: number
  stdout: string
  stderr: string
}

type RunOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
}

test('inox file compiles and runs on the fly', async () => {
  const result = await runCli(['tests/fixtures/parser/valid/hello.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'hello\n')
  assert.equal(result.stderr, '')
})

test('inox accepts valid TypeScript files as canonical source input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-ts-cli-'))
  const entry = join(dir, 'main.ts')

  try {
    await writeFile(
      entry,
      `const name: string = 'Ada'
console.log(\`hello \${name}\`)
`
    )

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

test('inox file --emit c writes C source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-test-'))
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

test('inox file --emit c reads Math.random seed config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-random-config-test-'))
  const out = join(dir, 'random.c')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const value = Math.random()
console.log(value)

`
    )
    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          random: {
            backend: 'xorshift32',
            seed: 1
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['main.ts', '--emit', 'c', '-o', out], {
      cwd: dir
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const c = await readFile(out, 'utf8')

    assert.match(c, /static uint32_t inox_math_random_state = 0x00000001u;/)
    assert.match(c, /value \^= value << 13;/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox.config.json takes precedence over inox.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-random-config-test-'))
  const out = join(dir, 'random.c')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const value = Math.random()
console.log(value)

`
    )
    await writeFile(
      join(dir, 'inox.json'),
      `${JSON.stringify(
        {
          random: {
            backend: 'xorshift32',
            seed: 1
          }
        },
        null,
        2
      )}\n`
    )
    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          random: {
            backend: 'xorshift32',
            seed: 2
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['main.ts', '--emit', 'c', '-o', out], {
      cwd: dir
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const c = await readFile(out, 'utf8')

    assert.match(c, /static uint32_t inox_math_random_state = 0x00000002u;/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox file --emit c reads TLS backend config for HTTPS fetch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-tls-config-test-'))
  const out = join(dir, 'fetch.c')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const response = await fetch('https://example.test/hello')
console.log(response.status)

`
    )
    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          c: {
            loopBackend: 'libuv',
            tlsBackend: 'boringssl'
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['main.ts', '--emit', 'c', '-o', out], {
      cwd: dir
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const c = await readFile(out, 'utf8')
    assert.match(c, /"https:\/\/example\.test\/hello"/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox file --emit c reads Math.random os backend config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-random-os-config-test-'))
  const out = join(dir, 'random.c')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const value = Math.random()
console.log(value)

`
    )
    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          random: {
            backend: 'os'
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['main.ts', '--emit', 'c', '-o', out], {
      cwd: dir
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const c = await readFile(out, 'utf8')

    assert.match(c, /static int inox_os_random_bytes\(uint8_t\* out, size_t len\)/)
    assert.match(c, /arc4random_buf\(out, len\)|getrandom\(out \+ filled, len - filled, 0\)|rand_s\(&value\)/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox file --emit c checks embedded entropy capability for Math.random os backend', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-random-entropy-config-test-'))
  const out = join(dir, 'random.c')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const value = Math.random()
console.log(value)

`
    )
    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          profile: 'embedded',
          random: {
            backend: 'os'
          }
        },
        null,
        2
      )}\n`
    )

    const missing = await runCli(['main.ts', '--emit', 'c', '-o', out], {
      cwd: dir
    })

    assert.equal(missing.code, 1)
    assert.match(missing.stderr, /INOX_CAPABILITY: embedded profile requires entropy capability for Math\.random/)

    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          profile: 'embedded',
          capabilities: {
            entropy: true
          },
          random: {
            backend: 'os'
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['main.ts', '--emit', 'c', '-o', out], {
      cwd: dir
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const c = await readFile(out, 'utf8')

    assert.match(c, /inox_os_random_bytes/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox file --emit c reads embedded profile capability config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-capability-config-test-'))
  const out = join(dir, 'time.c')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const now = Date.now()
console.log(now)

`
    )
    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          profile: 'embedded'
        },
        null,
        2
      )}\n`
    )

    const missing = await runCli(['main.ts', '--emit', 'c', '-o', out], {
      cwd: dir
    })

    assert.equal(missing.code, 1)
    assert.match(missing.stderr, /INOX_CAPABILITY: embedded profile requires wall-clock capability for Date\.now/)

    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          profile: 'embedded',
          capabilities: {
            wallClock: true
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['main.ts', '--emit', 'c', '-o', out], {
      cwd: dir
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const c = await readFile(out, 'utf8')

    assert.match(c, /#include "inox\/time\.h"/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox file --emit c reads C budget config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-budget-config-test-'))
  const out = join(dir, 'values.c')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const values = [1, 2, 3]
console.log(values.length)

`
    )
    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          budgets: {
            maxRuntimeRequirements: 0
          }
        },
        null,
        2
      )}\n`
    )

    const exceeded = await runCli(['main.ts', '--emit', 'c', '-o', out], {
      cwd: dir
    })

    assert.equal(exceeded.code, 1)
    assert.match(exceeded.stderr, /INOX_BUDGET: C target uses 3 runtime requirements/)

    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          budgets: {
            maxRuntimeRequirements: 3
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['main.ts', '--emit', 'c', '-o', out], {
      cwd: dir
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox module graph --emit c writes bundled C source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-test-'))
  const out = join(dir, 'modules.c')

  try {
    const result = await runCli(['tests/fixtures/modules/basic/main.js', '--emit', 'c', '-o', out])

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const c = await readFile(out, 'utf8')
    assert.match(c, /void greet\(void\);/)
    assert.match(c, /int main\(void\)/)
    assert.match(c, /greet\(\);/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox module graph --emit c --out-dir --entry writes and builds modular C sources', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-modular-c-test-'))
  const src = join(dir, 'src')
  const generated = join(dir, 'generated')
  const out = join(dir, 'main')

  try {
    await mkdir(src, {
      recursive: true
    })
    await writeFile(
      join(src, 'dep.ts'),
      `console.log('dep init')

export function value(): number {
  return 4
}

export function asyncText(): Promise<string> {
  return new Promise((resolve) => {
    const label = 'ready'

    setTimeout(() => {
      resolve(\`\${label} \${String(value())}\`)
    }, 1)
  })
}
`
    )
    await writeFile(
      join(src, 'util.ts'),
      `import { value as readValue } from './dep.ts'

export function greet(): void {
  console.log('value', readValue())
}
`
    )
    await writeFile(
      join(src, 'main.ts'),
      `import { asyncText, value } from './dep.ts'
import { greet } from './util.ts'

console.log('main', value())
greet()
const text = await asyncText()
console.log('text', text)
`
    )

    const result = await runCli(['src/main.ts', '--emit', 'c', '--out-dir', generated, '--entry'], {
      cwd: dir
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${generated}\n`)

    const mainC = await readFile(join(generated, 'src/main.c'), 'utf8')
    const depC = await readFile(join(generated, 'src/dep.c'), 'utf8')
    const depH = await readFile(join(generated, 'src/dep.h'), 'utf8')
    const utilC = await readFile(join(generated, 'src/util.c'), 'utf8')
    const depInit = /inox_mod_src_dep_ts_[a-f0-9]{8}_init/.exec(depH)?.[0]

    assert.match(mainC, /#include "dep\.h"/)
    assert.match(mainC, /#include "util\.h"/)
    assert.match(mainC, /int main\(void\)/)
    assert.match(depC, /static bool inox_initialized = false;/)
    assert.ok(depInit)
    assert.match(depC, new RegExp(`void ${depInit}\\(void\\)`))
    assert.match(utilC, new RegExp(`${depInit}\\(\\);`))

    const build = await runCommand('cc', [
      '-I',
      join(repoRoot, 'runtime/include'),
      join(generated, 'src/main.c'),
      join(generated, 'src/dep.c'),
      join(generated, 'src/util.c'),
      ...cRuntimeSources(),
      '-o',
      out
    ])

    assert.equal(build.code, 0, build.stderr)

    const run = await runCommand(out, [])

    assert.equal(run.code, 0)
    assert.equal(run.stdout, 'dep init\nmain 4\nvalue 4\ntext ready 4\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox build --target c writes a native executable', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-test-'))
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

test('inox build --target c uses CC compiler override', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-test-'))
  const out = join(dir, 'hello')
  const wrapper = join(dir, 'cc-wrapper.sh')
  const log = join(dir, 'cc.log')

  try {
    await writeFile(
      wrapper,
      `#!/bin/sh
printf '<%s>\\n' "$0" "$@" > "$INOX_CC_LOG"
exec cc "$@"
`
    )
    await chmod(wrapper, 0o755)

    const result = await runCli(['build', 'tests/fixtures/parser/valid/hello.ts', '--target', 'c', '-o', out], {
      env: {
        CC: wrapper,
        CFLAGS: '"-Inonexistent path with spaces" -DINOX_TEST_CFLAG=1',
        LDFLAGS: "'-Llinker path with spaces' -DINOX_TEST_LDFLAG=1",
        INOX_CC_LOG: log
      }
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const invocation = await readFile(log, 'utf8')
    const run = await runCommand(out, [])

    assert.match(invocation, new RegExp(escapeRegExp(wrapper)))
    assert.match(invocation, /<-Inonexistent path with spaces>/)
    assert.match(invocation, /-DINOX_TEST_CFLAG=1/)
    assert.match(invocation, /<-Llinker path with spaces>/)
    assert.match(invocation, /-DINOX_TEST_LDFLAG=1/)
    assert.match(invocation, /runtime\/src\/console\/console\.c/)
    assert.doesNotMatch(invocation, /runtime\/src\/fs\/fs\.c/)
    assert.equal(run.code, 0)
    assert.equal(run.stdout, 'hello\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox build --target c links only needed C runtime source groups', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-runtime-select-test-'))
  const out = join(dir, 'time')
  const wrapper = join(dir, 'cc-wrapper.sh')
  const log = join(dir, 'cc.log')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const now = Date.now()
console.log(now)

`
    )
    await writeFile(
      wrapper,
      `#!/bin/sh
printf '<%s>\\n' "$0" "$@" > "$INOX_CC_LOG"
exec cc "$@"
`
    )
    await chmod(wrapper, 0o755)

    const result = await runCli(['build', 'main.ts', '--target', 'c', '--loop-backend', 'libuv', '-o', out], {
      cwd: dir,
      env: {
        CC: wrapper,
        INOX_CC_LOG: log
      }
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const invocation = await readFile(log, 'utf8')

    assert.match(invocation, /runtime\/src\/time\/time\.c/)
    assert.match(invocation, /runtime\/src\/console\/console\.c/)
    assert.match(invocation, /runtime\/src\/core\/value\.c/)
    assert.doesNotMatch(invocation, /runtime\/src\/fs\/fs\.c/)
    assert.doesNotMatch(invocation, /runtime\/src\/json\/json\.c/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox build --target c enables weak runtime from IR requirements', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-weak-runtime-select-test-'))
  const out = join(dir, 'weak')
  const wrapper = join(dir, 'cc-wrapper.sh')
  const log = join(dir, 'cc.log')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `type Parent = {
  name: string
}

type Child = {
  weak parent: Parent | null
}

const parent: Parent = { name: 'Ada' }
const child: Child = { parent }
console.log(child.parent?.name ?? 'missing')
`
    )
    await writeFile(
      wrapper,
      `#!/bin/sh
printf '<%s>\\n' "$0" "$@" > "$INOX_CC_LOG"
exit 0
`
    )
    await chmod(wrapper, 0o755)

    const result = await runCli(['build', 'main.ts', '--target', 'c', '-o', out], {
      cwd: dir,
      env: {
        CC: wrapper,
        INOX_CC_LOG: log
      }
    })

    assert.equal(result.code, 0, result.stderr)
    assert.equal(result.stdout, `${out}\n`)

    const invocation = await readFile(log, 'utf8')

    assert.match(invocation, /-DINOX_ENABLE_WEAK=1/)
    assert.match(invocation, /runtime\/src\/core\/weak\.c/)
    assert.match(invocation, /runtime\/src\/objects\/object\.c/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox build --target c links TLS runtime source with fetch', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-fetch-runtime-select-test-'))
  const out = join(dir, 'fetch')
  const wrapper = join(dir, 'cc-wrapper.sh')
  const log = join(dir, 'cc.log')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const response = await fetch('http://127.0.0.1:1/')
const text = await response.text()
`
    )
    await writeFile(
      wrapper,
      `#!/bin/sh
printf '<%s>\\n' "$0" "$@" > "$INOX_CC_LOG"
exec cc "$@"
`
    )
    await chmod(wrapper, 0o755)

    const result = await runCli(['build', 'main.ts', '--target', 'c', '--loop-backend', 'libuv', '-o', out], {
      cwd: dir,
      env: {
        CC: wrapper,
        INOX_CC_LOG: log
      }
    })

    assert.equal(result.code, 0, result.stderr)
    assert.equal(result.stdout, `${out}\n`)

    const invocation = await readFile(log, 'utf8')

    assert.match(invocation, /runtime\/src\/network\/fetch\.c/)
    assert.match(invocation, /runtime\/src\/network\/net\.c/)
    assert.match(invocation, /runtime\/src\/network\/tls\.c/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox build --target c selects configured TLS runtime source with fetch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-fetch-tls-select-test-'))
  const out = join(dir, 'fetch')
  const wrapper = join(dir, 'cc-wrapper.sh')
  const log = join(dir, 'cc.log')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const response = await fetch('https://example.com/')
const text = await response.text()
`
    )
    await writeFile(
      wrapper,
      `#!/bin/sh
printf '<%s>\\n' "$0" "$@" > "$INOX_CC_LOG"
exit 0
`
    )
    await chmod(wrapper, 0o755)

    const result = await runCli(
      ['build', 'main.ts', '--target', 'c', '--loop-backend', 'libuv', '--tls-backend', 'openssl', '-o', out],
      {
        cwd: dir,
        env: {
          CC: wrapper,
          INOX_CC_LOG: log
        }
      }
    )

    assert.equal(result.code, 0, result.stderr)
    assert.equal(result.stdout, `${out}\n`)

    const invocation = await readFile(log, 'utf8')

    assert.match(invocation, /runtime\/src\/network\/fetch\.c/)
    assert.match(invocation, /runtime\/src\/network\/net\.c/)
    assert.match(invocation, /runtime\/src\/network\/tls-openssl\.c/)
    assert.doesNotMatch(invocation, /runtime\/src\/network\/tls\.c/)
    assert.doesNotMatch(invocation, /runtime\/src\/network\/tls-boringssl\.c/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox build --target c passes OpenSSL crypto flags for node:crypto createHash', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-crypto-openssl-select-test-'))
  const out = join(dir, 'hash')
  const wrapper = join(dir, 'cc-wrapper.sh')
  const log = join(dir, 'cc.log')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `import { createHash } from 'node:crypto'

console.log(createHash('sha256').update('hello').digest('hex'))
`
    )
    await writeFile(
      wrapper,
      `#!/bin/sh
printf '<%s>\\n' "$0" "$@" > "$INOX_CC_LOG"
exit 0
`
    )
    await chmod(wrapper, 0o755)

    const result = await runCli(
      ['build', 'main.ts', '--target', 'c', '--loop-backend', 'libuv', '--tls-backend', 'openssl', '-o', out],
      {
        cwd: dir,
        env: {
          CC: wrapper,
          INOX_CC_LOG: log
        }
      }
    )

    assert.equal(result.code, 0, result.stderr)
    assert.equal(result.stdout, `${out}\n`)

    const invocation = await readFile(log, 'utf8')

    assert.match(invocation, /-DINOX_TLS_BACKEND_OPENSSL=1/)
    assert.match(invocation, /runtime\/src\/crypto\/crypto\.c/)
    assert.match(invocation, /-lcrypto/)
    assert.doesNotMatch(invocation, /runtime\/src\/network\/tls-openssl\.c/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox build --target c reads inox.config.json toolchain settings', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-config-test-'))
  const out = join(dir, 'hello')
  const wrapper = join(dir, 'cc-wrapper.sh')
  const log = join(dir, 'cc.log')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `console.log('hello')
`
    )
    await writeFile(
      wrapper,
      `#!/bin/sh
printf '<%s>\\n' "$0" "$@" > "$INOX_CC_LOG"
exec cc "$@"
`
    )
    await chmod(wrapper, 0o755)
    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          c: {
            cc: wrapper,
            cflags: ['-Inonexistent config path with spaces', '-DINOX_CONFIG_CFLAG=1'],
            ldflags: ['-Llinker config path with spaces', '-DINOX_CONFIG_LDFLAG=1']
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['build', 'main.ts', '--target', 'c', '-o', out], {
      cwd: dir,
      env: {
        INOX_CC_LOG: log
      }
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const invocation = await readFile(log, 'utf8')
    const run = await runCommand(out, [])

    assert.match(invocation, new RegExp(escapeRegExp(wrapper)))
    assert.match(invocation, /<-Inonexistent config path with spaces>/)
    assert.match(invocation, /-DINOX_CONFIG_CFLAG=1/)
    assert.match(invocation, /<-Llinker config path with spaces>/)
    assert.match(invocation, /-DINOX_CONFIG_LDFLAG=1/)
    assert.equal(run.code, 0)
    assert.equal(run.stdout, 'hello\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox build --target c reads inox.json toolchain settings', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-config-test-'))
  const out = join(dir, 'hello')
  const wrapper = join(dir, 'cc-wrapper.sh')
  const log = join(dir, 'cc.log')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `console.log('hello')
`
    )
    await writeFile(
      wrapper,
      `#!/bin/sh
printf '<%s>\\n' "$0" "$@" > "$INOX_CC_LOG"
exec cc "$@"
`
    )
    await chmod(wrapper, 0o755)
    await writeFile(
      join(dir, 'inox.json'),
      `${JSON.stringify(
        {
          c: {
            cc: wrapper,
            cflags: ['-Inonexistent inox json path with spaces', '-DINOX_JSON_CFLAG=1'],
            ldflags: ['-Llinker inox json path with spaces', '-DINOX_JSON_LDFLAG=1']
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['build', 'main.ts', '--target', 'c', '-o', out], {
      cwd: dir,
      env: {
        INOX_CC_LOG: log
      }
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const invocation = await readFile(log, 'utf8')
    const run = await runCommand(out, [])

    assert.match(invocation, new RegExp(escapeRegExp(wrapper)))
    assert.match(invocation, /<-Inonexistent inox json path with spaces>/)
    assert.match(invocation, /-DINOX_JSON_CFLAG=1/)
    assert.match(invocation, /<-Llinker inox json path with spaces>/)
    assert.match(invocation, /-DINOX_JSON_LDFLAG=1/)
    assert.equal(run.code, 0)
    assert.equal(run.stdout, 'hello\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox build --target c prefers inox.config.json over inox.json', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-config-test-'))
  const out = join(dir, 'hello')
  const preferredWrapper = join(dir, 'preferred-cc-wrapper.sh')
  const fallbackWrapper = join(dir, 'fallback-cc-wrapper.sh')
  const log = join(dir, 'cc.log')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `console.log('hello')

`
    )
    await writeFile(
      preferredWrapper,
      `#!/bin/sh
printf 'preferred\\n<%s>\\n' "$0" "$@" > "$INOX_CC_LOG"
exec cc "$@"
`
    )
    await writeFile(
      fallbackWrapper,
      `#!/bin/sh
printf 'fallback\\n<%s>\\n' "$0" "$@" > "$INOX_CC_LOG"
exec cc "$@"
`
    )
    await chmod(preferredWrapper, 0o755)
    await chmod(fallbackWrapper, 0o755)
    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          c: {
            cc: preferredWrapper
          }
        },
        null,
        2
      )}\n`
    )
    await writeFile(
      join(dir, 'inox.json'),
      `${JSON.stringify(
        {
          c: {
            cc: fallbackWrapper
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['build', 'main.ts', '--target', 'c', '-o', out], {
      cwd: dir,
      env: {
        INOX_CC_LOG: log
      }
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const invocation = await readFile(log, 'utf8')

    assert.match(invocation, /^preferred\n/)
    assert.match(invocation, new RegExp(escapeRegExp(preferredWrapper)))
    assert.doesNotMatch(invocation, new RegExp(escapeRegExp(fallbackWrapper)))
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox build --target c reports invalid inox.config.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-config-test-'))

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `console.log('hello')

`
    )
    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          c: {
            cflags: [1]
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['build', 'main.ts', '--target', 'c'], {
      cwd: dir
    })

    assert.equal(result.code, 1)
    assert.match(result.stderr, /invalid inox\.config\.json: c\.cflags must be a string or an array of strings/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox build --target c reports invalid random seed config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-config-test-'))

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const value = Math.random()
console.log(value)

`
    )
    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          random: {
            seed: 1.5
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['build', 'main.ts', '--target', 'c'], {
      cwd: dir
    })

    assert.equal(result.code, 1)
    assert.match(result.stderr, /invalid inox\.config\.json: random\.seed must be an integer from 0 to 4294967295/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox build --target c reports invalid random backend config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-config-test-'))

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const value = Math.random()
console.log(value)

`
    )
    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          random: {
            backend: 'native'
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['build', 'main.ts', '--target', 'c'], {
      cwd: dir
    })

    assert.equal(result.code, 1)
    assert.match(result.stderr, /invalid inox\.config\.json: random\.backend must be "simple", "xorshift32" or "os"/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox build --target c reports invalid capability config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-config-test-'))

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `console.log('hello')

`
    )
    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          profile: 'embedded',
          capabilities: {
            wallClock: 'yes'
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['build', 'main.ts', '--target', 'c'], {
      cwd: dir
    })

    assert.equal(result.code, 1)
    assert.match(result.stderr, /invalid inox\.config\.json: capability wallClock must be boolean/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox build --target c reports invalid budget config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-config-test-'))

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `console.log('hello')

`
    )
    await writeFile(
      join(dir, 'inox.config.json'),
      `${JSON.stringify(
        {
          budgets: {
            maxFeatures: -1
          }
        },
        null,
        2
      )}\n`
    )

    const result = await runCli(['build', 'main.ts', '--target', 'c'], {
      cwd: dir
    })

    assert.equal(result.code, 1)
    assert.match(result.stderr, /invalid inox\.config\.json: budget maxFeatures must be a non-negative integer/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox run --target c builds and runs a temporary native executable', async (t) => {
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

test('inox run --target c builds and runs weak fields with automatic runtime selection', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-weak-cli-'))
  const entry = join(dir, 'main.ts')

  try {
    await writeFile(
      entry,
      `type Parent = {
  name: string
}

type Child = {
  weak parent: Parent | null
}

const parent: Parent = { name: 'Ada' }
const child: Child = { parent }
console.log(child.parent?.name ?? 'missing')
`
    )

    const result = await runCli(['run', entry, '--target', 'c'])

    assert.equal(result.code, 0, result.stderr)
    assert.equal(result.stdout, 'Ada\n')
    assert.equal(result.stderr, '')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox run --target c runs node:fs through non-libuv hosted fallback', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-fs-cli-'))
  const entry = join(dir, 'main.ts')
  const file = join(dir, 'value.txt')

  try {
    await writeFile(
      entry,
      `import fs from 'node:fs'

async function loadText(): Promise<string> {
  return fs.promises.readFile(${JSON.stringify(file)}, 'utf8')
}

await fs.promises.writeFile(${JSON.stringify(file)}, 'hello c fs')
const text = await loadText()
const entries = await fs.promises.readdir(${JSON.stringify(dir)})
const names = entries.sort()
console.log(text)
console.log(names[0], names[1])
`
    )

    const result = await runCli(['run', entry, '--target', 'c'])

    assert.equal(result.code, 0)
    assert.equal(result.stdout, 'hello c fs\nmain.ts value.txt\n')
    assert.equal(result.stderr, '')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox run --target c runs sync node:fs hosted fallback operations', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'inox-c-fs-sync-cli-'))
  const entry = join(dir, 'main.ts')
  const file = join(dir, 'value.txt')
  const copy = join(dir, 'copy.txt')
  const link = join(dir, 'copy-link.txt')

  try {
    await writeFile(
      entry,
      `import fs from 'node:fs'

fs.writeFileSync(${JSON.stringify(file)}, 'a')
fs.appendFileSync(${JSON.stringify(file)}, 'b')
fs.copyFileSync(${JSON.stringify(file)}, ${JSON.stringify(copy)})
fs.symlinkSync(${JSON.stringify(copy)}, ${JSON.stringify(link)})

const text = fs.readFileSync(${JSON.stringify(copy)}, 'utf8')
const target = fs.readlinkSync(${JSON.stringify(link)})
const real = fs.realpathSync(${JSON.stringify(link)})
const stats = fs.statSync(${JSON.stringify(copy)})
const linkStats = fs.lstatSync(${JSON.stringify(link)})

console.log(text, stats.isFile(), linkStats.isFile(), linkStats.isDirectory(), target.length > 0, real.length > 0)
`
    )

    const result = await runCli(['run', entry, '--target', 'c'])

    assert.equal(result.code, 0)
    assert.equal(result.stdout, 'ab 1 0 0 1 1\n')
    assert.equal(result.stderr, '')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox run --target c runs a module graph with import aliases', async (t) => {
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

test('inox run --target c runs a module graph with type imports', async (t) => {
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

test('inox run --target c resolves directory index imports', async (t) => {
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

test('inox run --target c --keep keeps temporary C artifacts', async (t) => {
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

test('inox run --keep writes temporary C output by default', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const result = await runCli(['tests/fixtures/parser/valid/hello.ts', '--keep'])
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

test('inox reports diagnostics for invalid source', async () => {
  const result = await runCli(['tests/fixtures/diagnostics/no-var.ts'])

  assert.equal(result.code, 1)
  assert.match(result.stderr, /INOX_NO_VAR/)
})

test('inox reports source file paths for module graph diagnostics', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'inox-cli-diagnostics-'))

  try {
    await writeFile(
      join(dir, 'index.ts'),
      `import { userName } from './user.ts'

console.log(userName())

`
    )
    await writeFile(
      join(dir, 'user.ts'),
      `export function userName(): string {
  return {}
}
`
    )

    const result = await runCli(['index.ts', '--emit', 'c'], {
      cwd: dir
    })

    assert.equal(result.code, 1)
    assert.match(result.stderr, new RegExp(`${escapeRegExp(join(dir, 'user.ts'))}:2:\\d+ INOX_TYPE_MISMATCH`))
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('inox file runs a multi-file module graph', async () => {
  const result = await runCli(['tests/fixtures/modules/basic/main.js'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'from module\n')
  assert.equal(result.stderr, '')
})

test('inox file runs a module graph with import aliases', async () => {
  const result = await runCli(['tests/fixtures/modules/alias/main.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'from alias\n')
  assert.equal(result.stderr, '')
})

test('inox file runs a module graph with type imports', async () => {
  const result = await runCli(['tests/fixtures/modules/type-import/main.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'Ada\n')
  assert.equal(result.stderr, '')
})

test('inox file resolves directory index imports', async () => {
  const result = await runCli(['tests/fixtures/modules/index-import/main.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'from index\n')
  assert.equal(result.stderr, '')
})

test('inox file runs if else blocks', async () => {
  const result = await runCli(['tests/fixtures/runtime/if-else.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'yes\n')
  assert.equal(result.stderr, '')
})

test('inox file runs while loops', async () => {
  const result = await runCli(['tests/fixtures/runtime/while.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, '6\n')
  assert.equal(result.stderr, '')
})

test('inox file runs classic for loops', async () => {
  const result = await runCli(['tests/fixtures/runtime/for.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, '6\n')
  assert.equal(result.stderr, '')
})

test('inox file runs continue statements', async () => {
  const result = await runCli(['tests/fixtures/runtime/continue.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, '8\n')
  assert.equal(result.stderr, '')
})

test('inox file runs switch statements', async () => {
  const result = await runCli(['tests/fixtures/runtime/switch.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'two\n')
  assert.equal(result.stderr, '')
})

test('inox file runs try catch finally', async () => {
  const result = await runCli(['tests/fixtures/runtime/try-catch.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'caught boom\nfinally\n')
  assert.equal(result.stderr, '')
})

function runCli(args: string[], options: RunOptions = {}): Promise<CommandResult> {
  return runCommand(process.execPath, [cliPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    env:
      options.env == null
        ? undefined
        : {
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

    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      })
    })
  })
}

function cRuntimeSources(): string[] {
  return [
    'runtime/src/arrays/array.c',
    'runtime/src/async/loop.c',
    'runtime/src/async/promise.c',
    'runtime/src/binary/binary.c',
    'runtime/src/child_process/child_process.c',
    'runtime/src/collections/map.c',
    'runtime/src/collections/set.c',
    'runtime/src/console/console.c',
    'runtime/src/core/allocator.c',
    'runtime/src/core/callback.c',
    'runtime/src/core/debug.c',
    'runtime/src/core/value.c',
    'runtime/src/crypto/crypto.c',
    'runtime/src/core/weak.c',
    'runtime/src/fs/fs.c',
    'runtime/src/json/json.c',
    'runtime/src/objects/object.c',
    'runtime/src/path/path.c',
    'runtime/src/process/process.c',
    'runtime/src/strings/string.c',
    'runtime/src/time/time.c',
    'runtime/src/url/url.c'
  ].map((source) => join(repoRoot, source))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
