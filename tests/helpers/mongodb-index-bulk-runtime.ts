import type { MongoBsonRuntimeCompiler } from './mongodb-bson-runtime.ts'
import { assertMongoServerRuntime } from './mongodb-server-runtime.ts'

const resultPrefix = 'INOX_MONGODB_INDEX_BULK '

export async function assertMongoIndexBulkRuntime(compiler: MongoBsonRuntimeCompiler): Promise<void> {
  await assertMongoServerRuntime(compiler, {
    name: 'mongodb-index-bulk-runtime',
    resultPrefix,
    source: mongoIndexBulkSource,
    expectedLines: [
      `${resultPrefix}indexes name_1 count_1 category_count`,
      `${resultPrefix}collection 2 2 2 1 0`,
      `${resultPrefix}client 2 1 1 0 0`,
      `${resultPrefix}totals 2 1`
    ]
  })
}

function mongoIndexBulkSource(port: number): string {
  return `import { MongoClient, type Document } from 'mongodb'

type Item = Document & {
  name: string
  count: number
}

const client = await MongoClient.connect('mongodb://127.0.0.1:${port}/inox_index_bulk?serverSelectionTimeoutMS=3000')
const items = client.db().collection<Item>('items')
const logs = client.db().collection('logs')

await items.deleteMany({})
await logs.deleteMany({})

const firstIndex = await items.createIndex({ name: 1 }, { unique: true })
const indexes = await items.createIndexes([
  { key: { count: 1 } },
  { key: { category: 1, count: -1 }, name: 'category_count' }
])

const collectionResult = await items.bulkWrite([
  { insertOne: { document: { name: 'one', count: 1 } } },
  { insertOne: { document: { name: 'two', count: 2 } } },
  { updateOne: { filter: { name: 'one' }, update: { $inc: { count: 2 } } } },
  { replaceOne: { filter: { name: 'two' }, replacement: { name: 'two', count: 4 } } },
  { deleteOne: { filter: { name: 'two' } } }
], { ordered: false })

const clientResult = await client.bulkWrite([
  {
    namespace: 'inox_index_bulk.items',
    name: 'insertOne',
    document: { name: 'client', count: 5 }
  },
  {
    namespace: 'inox_index_bulk.logs',
    name: 'insertOne',
    document: { event: 'created' }
  },
  {
    namespace: 'inox_index_bulk.items',
    name: 'updateMany',
    filter: { name: 'client' },
    update: { $inc: { count: 1 } }
  },
  {
    namespace: 'inox_index_bulk.logs',
    name: 'deleteMany',
    filter: { event: 'missing' }
  }
], { ordered: false })

console.log('${resultPrefix}indexes', firstIndex, indexes[0], indexes[1])
console.log(
  '${resultPrefix}collection',
  collectionResult.insertedCount,
  collectionResult.matchedCount,
  collectionResult.modifiedCount,
  collectionResult.deletedCount,
  collectionResult.upsertedCount
)
console.log(
  '${resultPrefix}client',
  clientResult.insertedCount,
  clientResult.matchedCount,
  clientResult.modifiedCount,
  clientResult.deletedCount,
  clientResult.upsertedCount
)
console.log(
  '${resultPrefix}totals',
  await items.estimatedDocumentCount(),
  await logs.estimatedDocumentCount()
)

await client.close()
`
}
