// @targets c
// @expect pass

async function work(): Promise<Buffer> {
  try {
    try {
      const value: Buffer = await Promise.reject('inner')
      return value
    } catch (error) {
      const suffix: Buffer = Buffer.from('ok', 'utf8')
      console.log(error)
      console.log(suffix.length)
      return suffix
    } finally {
      console.log('inner finally')
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  console.log(result.toString())
}
