// @targets c
// @expect pass

async function work(): Promise<Buffer> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const suffix: Buffer = Buffer.from('ok', 'utf8')
      console.log(value)
      return suffix
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

const result: Buffer = await work()
console.log(result.toString())

