// @targets c
// @expect pass

async function work(): Promise<Buffer> {
  try {
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log('inner')
    }
    const suffix: Buffer = Buffer.from('ok', 'utf8')
    console.log(suffix.length)
    return suffix
  } finally {
    console.log('outer')
  }
}

const result: Buffer = await work()
console.log(result.toString())

