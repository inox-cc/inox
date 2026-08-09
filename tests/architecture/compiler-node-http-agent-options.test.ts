import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:http Agent принимает package-native instance и literal false', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const options = {
    libraries,
    libraryOptions: [{ optionId: 'target:runtime#loop-backend', value: 'libuv' }],
    target: 'cc' as const
  }
  const result = compileSource(
    `
      import http from 'node:http'
      const agent = new http.Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1, timeout: 1000 })
      http.get({ hostname: '127.0.0.1', agent })
      http.get({ hostname: '127.0.0.1', agent: false })
      const globalAgent = http.globalAgent
      agent.destroy()
    `,
    options
  )

  assert.match(result.code, /HttpAgent\(HttpAgentOptions\(/)
  assert.match(result.code, /http\.globalAgent\(\)/)
  assert.match(result.code, /agent\.destroy\(\)/)
  assert.throws(
    () => compileSource("import http from 'node:http'\nhttp.get({ hostname: '127.0.0.1', agent: true })", options),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'INOX_NOT_IMPLEMENTED' &&
          diagnostic.message === 'library operation node:http#get option agent requires a supported boolean literal'
      )
  )
})
