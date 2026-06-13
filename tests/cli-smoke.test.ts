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

test('ccjs file --emit c reads Math.random seed config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-random-config-test-'))
  const out = join(dir, 'random.c')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const value = Math.random()
console.log(value)

`
    )
    await writeFile(
      join(dir, 'ccjs.config.json'),
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

    assert.match(c, /static uint32_t ccjs_math_random_state = 0x00000001u;/)
    assert.match(c, /value \^= value << 13;/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs file --emit c reads Math.random os backend config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-random-os-config-test-'))
  const out = join(dir, 'random.c')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const value = Math.random()
console.log(value)

`
    )
    await writeFile(
      join(dir, 'ccjs.config.json'),
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

    assert.match(c, /static int ccjs_os_random_bytes\(uint8_t\* out, size_t len\)/)
    assert.match(c, /arc4random_buf\(out, len\)|getrandom\(out \+ filled, len - filled, 0\)|rand_s\(&value\)/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs file --emit c checks embedded entropy capability for Math.random os backend', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-random-entropy-config-test-'))
  const out = join(dir, 'random.c')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const value = Math.random()
console.log(value)

`
    )
    await writeFile(
      join(dir, 'ccjs.config.json'),
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
    assert.match(missing.stderr, /CCJS_CAPABILITY: embedded profile requires entropy capability for Math\.random/)

    await writeFile(
      join(dir, 'ccjs.config.json'),
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

    assert.match(c, /ccjs_os_random_bytes/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs file --emit c reads embedded profile capability config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-capability-config-test-'))
  const out = join(dir, 'time.c')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const now = Date.now()
console.log(now)

`
    )
    await writeFile(
      join(dir, 'ccjs.config.json'),
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
    assert.match(missing.stderr, /CCJS_CAPABILITY: embedded profile requires wall-clock capability for Date\.now/)

    await writeFile(
      join(dir, 'ccjs.config.json'),
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

    assert.match(c, /#include "ccjs\/time\.h"/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs file --emit c reads C budget config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-budget-config-test-'))
  const out = join(dir, 'values.c')

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const values = [1, 2, 3]
console.log(values.length)

`
    )
    await writeFile(
      join(dir, 'ccjs.config.json'),
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
    assert.match(exceeded.stderr, /CCJS_BUDGET: C target uses 3 runtime requirements/)

    await writeFile(
      join(dir, 'ccjs.config.json'),
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

test('ccjs module graph --emit c writes bundled C source', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-test-'))
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

test('ccjs build --target c writes a native executable', async (t) => {
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

test('ccjs build --target c uses CC compiler override', async (t) => {
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
    await writeFile(
      wrapper,
      `#!/bin/sh
printf '<%s>\\n' "$0" "$@" > "$CCJS_CC_LOG"
exec cc "$@"
`
    )
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
    assert.doesNotMatch(invocation, /runtime\/c\/src\//)
    assert.equal(run.code, 0)
    assert.equal(run.stdout, 'hello\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs build --target c links only needed C runtime source groups', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-runtime-select-test-'))
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
printf '<%s>\\n' "$0" "$@" > "$CCJS_CC_LOG"
exec cc "$@"
`
    )
    await chmod(wrapper, 0o755)

    const result = await runCli(['build', 'main.ts', '--target', 'c', '-o', out], {
      cwd: dir,
      env: {
        CC: wrapper,
        CCJS_CC_LOG: log
      }
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, `${out}\n`)

    const invocation = await readFile(log, 'utf8')

    assert.match(invocation, /runtime\/c\/src\/time\/time\.c/)
    assert.doesNotMatch(invocation, /runtime\/c\/src\/fs\/fs\.c/)
    assert.doesNotMatch(invocation, /runtime\/c\/src\/json\/json\.c/)
    assert.doesNotMatch(invocation, /runtime\/c\/src\/core\/value\.c/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs build --target c reads ccjs.config.json toolchain settings', async (t) => {
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
    await writeFile(
      join(dir, 'main.ts'),
      `console.log('hello')
`
    )
    await writeFile(
      wrapper,
      `#!/bin/sh
printf '<%s>\\n' "$0" "$@" > "$CCJS_CC_LOG"
exec cc "$@"
`
    )
    await chmod(wrapper, 0o755)
    await writeFile(
      join(dir, 'ccjs.config.json'),
      `${JSON.stringify(
        {
          c: {
            cc: wrapper,
            cflags: ['-Inonexistent config path with spaces', '-DCCJS_CONFIG_CFLAG=1'],
            ldflags: ['-Llinker config path with spaces', '-DCCJS_CONFIG_LDFLAG=1']
          }
        },
        null,
        2
      )}\n`
    )

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

test('ccjs build --target c reads ccjs.json toolchain settings', async (t) => {
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
    await writeFile(
      join(dir, 'main.ts'),
      `console.log('hello')
`
    )
    await writeFile(
      wrapper,
      `#!/bin/sh
printf '<%s>\\n' "$0" "$@" > "$CCJS_CC_LOG"
exec cc "$@"
`
    )
    await chmod(wrapper, 0o755)
    await writeFile(
      join(dir, 'ccjs.json'),
      `${JSON.stringify(
        {
          c: {
            cc: wrapper,
            cflags: ['-Inonexistent ccjs json path with spaces', '-DCCJS_JSON_CFLAG=1'],
            ldflags: ['-Llinker ccjs json path with spaces', '-DCCJS_JSON_LDFLAG=1']
          }
        },
        null,
        2
      )}\n`
    )

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
    assert.match(invocation, /<-Inonexistent ccjs json path with spaces>/)
    assert.match(invocation, /-DCCJS_JSON_CFLAG=1/)
    assert.match(invocation, /<-Llinker ccjs json path with spaces>/)
    assert.match(invocation, /-DCCJS_JSON_LDFLAG=1/)
    assert.equal(run.code, 0)
    assert.equal(run.stdout, 'hello\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs build --target c prefers ccjs.config.json over ccjs.json', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-config-test-'))
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
printf 'preferred\\n<%s>\\n' "$0" "$@" > "$CCJS_CC_LOG"
exec cc "$@"
`
    )
    await writeFile(
      fallbackWrapper,
      `#!/bin/sh
printf 'fallback\\n<%s>\\n' "$0" "$@" > "$CCJS_CC_LOG"
exec cc "$@"
`
    )
    await chmod(preferredWrapper, 0o755)
    await chmod(fallbackWrapper, 0o755)
    await writeFile(
      join(dir, 'ccjs.config.json'),
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
      join(dir, 'ccjs.json'),
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
        CCJS_CC_LOG: log
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

test('ccjs build --target c reports invalid ccjs.config.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-config-test-'))

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `console.log('hello')

`
    )
    await writeFile(
      join(dir, 'ccjs.config.json'),
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
    assert.match(result.stderr, /invalid ccjs\.config\.json: c\.cflags must be a string or an array of strings/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs build --target c reports invalid random seed config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-config-test-'))

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const value = Math.random()
console.log(value)

`
    )
    await writeFile(
      join(dir, 'ccjs.config.json'),
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
    assert.match(result.stderr, /invalid ccjs\.config\.json: random\.seed must be an integer from 0 to 4294967295/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs build --target c reports invalid random backend config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-config-test-'))

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `const value = Math.random()
console.log(value)

`
    )
    await writeFile(
      join(dir, 'ccjs.config.json'),
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
    assert.match(result.stderr, /invalid ccjs\.config\.json: random\.backend must be "simple", "xorshift32" or "os"/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs build --target c reports invalid capability config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-config-test-'))

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `console.log('hello')

`
    )
    await writeFile(
      join(dir, 'ccjs.config.json'),
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
    assert.match(result.stderr, /invalid ccjs\.config\.json: capability wallClock must be boolean/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs build --target c reports invalid budget config', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-config-test-'))

  try {
    await writeFile(
      join(dir, 'main.ts'),
      `console.log('hello')

`
    )
    await writeFile(
      join(dir, 'ccjs.config.json'),
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
    assert.match(result.stderr, /invalid ccjs\.config\.json: budget maxFeatures must be a non-negative integer/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('ccjs run --target c builds and runs a temporary native executable', async (t) => {
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

test('ccjs run --target c runs fs globals through hosted fallback', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-fs-cli-'))
  const entry = join(dir, 'main.ts')
  const file = join(dir, 'value.txt')

  try {
    await writeFile(
      entry,
      `async function loadText(): Promise<string> {
  return fs.readFile(${JSON.stringify(file)}, 'utf8')
}

await fs.writeFile(${JSON.stringify(file)}, 'hello c fs')
const text = await loadText()
const entries = await fs.readDir(${JSON.stringify(dir)})
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

test('ccjs run --target c runs a module graph with import aliases', async (t) => {
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

test('ccjs run --target c runs a module graph with type imports', async (t) => {
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

test('ccjs run --target c resolves directory index imports', async (t) => {
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

test('ccjs run --target c --keep keeps temporary C artifacts', async (t) => {
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

test('ccjs run --keep writes temporary C output by default', async (t) => {
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

test('ccjs reports diagnostics for invalid source', async () => {
  const result = await runCli(['tests/fixtures/diagnostics/no-var.ts'])

  assert.equal(result.code, 1)
  assert.match(result.stderr, /CCJS_NO_VAR/)
})

test('ccjs reports source file paths for module graph diagnostics', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-cli-diagnostics-'))

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
    assert.match(result.stderr, new RegExp(`${escapeRegExp(join(dir, 'user.ts'))}:2:\\d+ CCJS_TYPE_MISMATCH`))
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
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

test('ccjs file runs switch statements', async () => {
  const result = await runCli(['tests/fixtures/runtime/switch.ts'])

  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'two\n')
  assert.equal(result.stderr, '')
})

test('ccjs file runs try catch finally', async () => {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
