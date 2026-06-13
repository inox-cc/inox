// @targets c
// @expect pass

async function work(): Promise<Buffer> {
  try {
    try {
      const prefix: Buffer = Buffer.from('ok', 'utf8')
      const pending: Promise<number> = Promise.resolve(prefix.length)
      const value: number = await pending
      return prefix
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

const result: Buffer = await work()
console.log(result.length, result.toString())

