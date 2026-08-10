import type { LibraryIntegrationTest } from '../../../../../tests/helpers/library-integration-tests.ts'
import { assertMongoCrudRuntime } from '../helpers/mongodb-crud-runtime.ts'
import { mongoRuntimeCompiler } from '../helpers/mongodb-bson-runtime.ts'

export const libraryIntegrationTest = {
  name: 'mongodb-crud-runtime',
  async run(compiler): Promise<void> {
    await assertMongoCrudRuntime(mongoRuntimeCompiler(compiler))
  }
} satisfies LibraryIntegrationTest
