import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileSource } from '../../compiler/core.ts'
import { CompileError } from '../../compiler/diagnostics.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('node:https Agent наследует общий HTTP Agent contract и поддерживает literal false', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const options = {
    libraries,
    libraryOptions: [
      { optionId: 'target:runtime#loop-backend', value: 'libuv' },
      { optionId: 'target:runtime#tls-backend', value: 'boringssl' }
    ],
    target: 'cc' as const
  }
  const result = compileSource(
    `
      import http from 'node:http'
      import https from 'node:https'
      const agent = new https.Agent({ keepAlive: true, maxSockets: 1, maxFreeSockets: 1, timeout: 1000 })
      https.get({ hostname: '127.0.0.1', agent })
      https.get({ hostname: '127.0.0.1', agent: new http.Agent() })
      https.get({ hostname: '127.0.0.1', agent: false })
      const globalAgent = https.globalAgent
      agent.destroy()
      globalAgent.destroy()
    `,
    options
  )

  assert.match(result.code, /HttpAgent\(HttpAgentOptions\(/)
  assert.match(result.code, /https\.globalAgent\(\)/)
  assert.match(result.code, /agent\.destroy\(\)/)
  assert.match(result.code, /globalAgent\.destroy\(\)/)
  assert.throws(
    () => compileSource("import https from 'node:https'\nhttps.get({ hostname: '127.0.0.1', agent: true })", options),
    (error: unknown) =>
      error instanceof CompileError &&
      error.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'INOX_NOT_IMPLEMENTED' &&
          diagnostic.message === 'library operation node:https#get option agent requires a supported boolean literal'
      )
  )
})
