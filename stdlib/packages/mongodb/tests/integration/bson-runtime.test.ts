import type { LibraryIntegrationTest } from '../../../../../tests/helpers/library-integration-tests.ts'
import { assertMongoBsonRuntime, mongoRuntimeCompiler } from '../helpers/mongodb-bson-runtime.ts'

export const libraryIntegrationTest = {
  name: 'mongodb-bson-runtime',
  async run(compiler): Promise<void> {
    await assertMongoBsonRuntime(mongoRuntimeCompiler(compiler))
  }
} satisfies LibraryIntegrationTest
