import type { MongoBsonRuntimeCompiler } from './mongodb-bson-runtime.ts'
import { assertMongoServerRuntime } from './mongodb-server-runtime.ts'

const resultPrefix = 'INOX_MONGODB_QUERY '

export async function assertMongoQueryRuntime(compiler: MongoBsonRuntimeCompiler): Promise<void> {
  await assertMongoServerRuntime(compiler, {
    name: 'mongodb-query-runtime',
    resultPrefix,
    source: mongoQuerySource,
    expectedLines: [
      `${resultPrefix}array one three`,
      `${resultPrefix}next one three`,
      `${resultPrefix}aggregate two three`,
      `${resultPrefix}counts 2 2 3`
    ]
  })
}

function mongoQuerySource(port: number): string {
  return `import { MongoClient, type Document } from 'mongodb'

type Item = Document & {
  name: string
  count: number
}

const client = await MongoClient.connect('mongodb://127.0.0.1:${port}/inox_query?serverSelectionTimeoutMS=3000')
const collection = client.db().collection<Item>('items')

await collection.deleteMany({})
await collection.insertMany([
  { name: 'three', count: 2 },
  { name: 'one', count: 1 },
  { name: 'two', count: 2 }
])

const values = await collection.find().sort({ name: 1 }).limit(2).toArray()
const cursor = collection.find().sort({ name: 1 })
const first = await cursor.next()
const second = await cursor.next()
const aggregated = await collection.aggregate<Item>([
  { $match: { count: { $gte: 2 } } },
  { $project: { _id: 0, name: 1, count: 1 } }
]).sort({ name: -1 }).limit(2).toArray()
const distinct = await collection.distinct('count')
const count = await collection.countDocuments({ count: 2 })
const estimated = await collection.estimatedDocumentCount()

console.log('${resultPrefix}array', values[0]?.name, values[1]?.name)
console.log('${resultPrefix}next', first?.name, second?.name)
console.log('${resultPrefix}aggregate', aggregated[0]?.name, aggregated[1]?.name)
console.log('${resultPrefix}counts', distinct.length, count, estimated)

await client.close()
`
}
