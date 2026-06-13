// @targets c
// @expect pass

async function work(): Promise<Buffer> {
  try {
    try {
      const value: Buffer = await Promise.reject('inner')
      return value
    } catch (error) {
      console.log(error)
      return Buffer.from('ok', 'utf8')
    } finally {
      console.log('inner finally')
    }
  } finally {
    console.log('outer')
  }
}

const result: Buffer = await work()
console.log(result.toString())

