// @targets c
// @expect pass

async function work(): Promise<Buffer> {
  try {
    const prefix: Buffer = Buffer.from('abc', 'utf8')
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.length)
    }
    console.log(prefix[1])
    return prefix
  } finally {
    console.log('outer')
  }
}

const result: Buffer = await work()
const text = result.toString()
console.log(result[0], result[1], text)

