// @targets c
// @expect pass

async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const scratch: Buffer = Buffer.from('ok', 'utf8')
      console.log(value, scratch.length)
    } finally {
      console.log('inner')
    }
    console.log('after')
    return 9
  } finally {
    console.log('outer')
  }
}

console.log(await work())

