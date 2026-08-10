import type { LibraryIntegrationTest } from '../../../../../tests/helpers/library-integration-tests.ts'
import { mongoRuntimeCompiler } from '../helpers/mongodb-bson-runtime.ts'
import { assertMongoServerEntryRuntime } from '../helpers/mongodb-server-entry-runtime.ts'

export const libraryIntegrationTest = {
  name: 'mongodb-server-entry-runtime',
  async run(compiler): Promise<void> {
    await assertMongoServerEntryRuntime(mongoRuntimeCompiler(compiler))
  }
} satisfies LibraryIntegrationTest
