import type { LibraryIntegrationTest } from '../../../../../tests/helpers/library-integration-tests.ts'
import { mongoRuntimeCompiler } from '../helpers/mongodb-bson-runtime.ts'
import { assertMongoIndexBulkRuntime } from '../helpers/mongodb-index-bulk-runtime.ts'

export const libraryIntegrationTest = {
  name: 'mongodb-index-bulk-runtime',
  async run(compiler): Promise<void> {
    await assertMongoIndexBulkRuntime(mongoRuntimeCompiler(compiler))
  }
} satisfies LibraryIntegrationTest
