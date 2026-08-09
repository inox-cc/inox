import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compileMemoryPackageToCppModules } from '../../compiler/core.ts'
import { discoverCompilerLibraries } from '../../scripts/lib/compiler-library-discovery.ts'
import { createCompilerLibrarySetFromDiscovered } from '../../scripts/lib/compiler-library-registry.ts'

test('type-only import сохраняет nominal identity package-native класса', async () => {
  const libraries = createCompilerLibrarySetFromDiscovered(await discoverCompilerLibraries())
  const result = await compileMemoryPackageToCppModules(
    '/project/main.ts',
    [
      {
        path: '/project/main.ts',
        source: `
          import https, { type Agent, type AgentOptions } from 'node:https'

          function createAgent(options: AgentOptions): Agent {
            return new https.Agent({ keepAlive: options.keepAlive ?? false })
          }

          function requestWith(agent: Agent): void {
            https.get({ hostname: '127.0.0.1', agent, rejectUnauthorized: false })
          }

          requestWith(createAgent({ keepAlive: true }))
        `
      }
    ],
    {
      libraries,
      libraryOptions: [
        { optionId: 'target:runtime#loop-backend', value: 'libuv' },
        { optionId: 'target:runtime#tls-backend', value: 'boringssl' }
      ],
      sourceRoot: '/project'
    }
  )
  const source = result.files.find((file) => file.path === 'main.cc')?.code ?? ''

  assert.match(source, /void requestWith\(HttpAgent agent\)/)
  assert.match(source, /HttpAgent createAgent\(inox_value options\)/)
  assert.match(source, /\{ "maxSockets", INOX_FIELD_READONLY \}/)
  assert.match(source, /https\.get\(HttpsRequestOptions\(/)
})
