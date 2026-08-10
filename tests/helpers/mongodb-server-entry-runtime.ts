import type { MongoBsonRuntimeCompiler } from './mongodb-bson-runtime.ts'
import { assertMongoServerRuntime } from './mongodb-server-runtime.ts'

const resultPrefix = 'INOX_MONGODB_SERVER '

export async function assertMongoServerEntryRuntime(compiler: MongoBsonRuntimeCompiler): Promise<void> {
  await assertMongoServerRuntime(compiler, {
    name: 'mongodb-server-entry-runtime',
    resultPrefix,
    source: mongoServerEntrySource,
    expectedLines: [
      `${resultPrefix}response 200 application/json; charset=utf-8 {"name":"inox","count":2}`,
      `${resultPrefix}closed 1`,
      `${resultPrefix}server closed`
    ]
  })
}

function mongoServerEntrySource(port: number): string {
  return `import http from 'node:http'
import { MongoClient, type Document } from 'mongodb'

type Item = Document & {
  name: string
  count: number
}

const client = await MongoClient.connect(
  'mongodb://127.0.0.1:${port}/inox_server_entry?serverSelectionTimeoutMS=3000'
)
const collection = client.db().collection<Item>('items')

await collection.deleteMany({})
await collection.insertOne({ name: 'inox', count: 2 })
const item = await collection.findOne({ name: 'inox' })

await client.close()
await client.close()

let rejected = false

try {
  await collection.countDocuments({})
} catch {
  rejected = true
}

const responseBody = JSON.stringify({ name: item?.name ?? '', count: item?.count ?? 0 })
const server = http.createServer((_request, response) => {
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(responseBody)
})

server.listen(0, '127.0.0.1', () => {
  const serverPort = server.address().port
  http.get('http://127.0.0.1:' + String(serverPort) + '/', (response) => {
    let body = ''
    response.setEncoding('utf8')
    response.on('data', (chunk) => {
      body = body + chunk
    })
    response.on('end', () => {
      console.log(
        '${resultPrefix}response',
        response.statusCode,
        response.headers['content-type'],
        body
      )
      console.log('${resultPrefix}closed', rejected)
      server.close(() => console.log('${resultPrefix}server closed'))
    })
  })
})
`
}
