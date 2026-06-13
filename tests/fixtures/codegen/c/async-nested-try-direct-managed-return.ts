// @targets c
// @expect pass

async function work(): Promise<Buffer> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      return Buffer.from('ok', 'utf8')
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  console.log(result.toString())
}
