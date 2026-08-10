import type { MongoBsonRuntimeCompiler } from './mongodb-bson-runtime.ts'
import { assertMongoServerRuntime } from './mongodb-server-runtime.ts'

const resultPrefix = 'INOX_MONGODB_CRUD '

export async function assertMongoCrudRuntime(compiler: MongoBsonRuntimeCompiler): Promise<void> {
  await assertMongoServerRuntime(compiler, {
    name: 'mongodb-crud-runtime',
    resultPrefix,
    source: mongoCrudSource,
    expectedLines: [
      `${resultPrefix}insert 1 2`,
      `${resultPrefix}find one 1`,
      `${resultPrefix}update 1 1 2`,
      `${resultPrefix}delete 1`,
      `${resultPrefix}close 1`
    ]
  })
}

function mongoCrudSource(port: number): string {
  return `import { MongoClient, type Document } from 'mongodb'

type Item = Document & {
  name: string
  count: number
}

const client = await MongoClient.connect('mongodb://127.0.0.1:${port}/inox_crud?serverSelectionTimeoutMS=3000')
const collection = client.db().collection<Item>('items')

await collection.deleteMany({})
const inserted = await collection.insertOne({ name: 'one', count: 1 })
const insertedMany = await collection.insertMany([
  { name: 'two', count: 2 },
  { name: 'three', count: 3 }
])
const found = await collection.findOne({ name: 'one' })
const updated = await collection.updateOne({ name: 'one' }, { $inc: { count: 4 } })
const replacement = await collection.findOneAndUpdate({ name: 'two' }, { $set: { count: 5 } })
const deleted = await collection.deleteMany({ count: 3 })

console.log('${resultPrefix}insert', inserted.acknowledged, insertedMany.insertedCount)
console.log('${resultPrefix}find', found?.name, found?.count)
console.log('${resultPrefix}update', updated.matchedCount, updated.modifiedCount, replacement?.count)
console.log('${resultPrefix}delete', deleted.deletedCount)

const pending = collection.insertOne({ name: 'closing', count: 9 })
await client.close()
const completed = await pending
console.log('${resultPrefix}close', completed.acknowledged)
`
}
