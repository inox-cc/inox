import type { LibraryIntegrationTest } from '../../../../../tests/helpers/library-integration-tests.ts'
import { mongoRuntimeCompiler } from '../helpers/mongodb-bson-runtime.ts'
import { assertMongoQueryRuntime } from '../helpers/mongodb-query-runtime.ts'

export const libraryIntegrationTest = {
  name: 'mongodb-query-runtime',
  async run(compiler): Promise<void> {
    await assertMongoQueryRuntime(mongoRuntimeCompiler(compiler))
  }
} satisfies LibraryIntegrationTest
