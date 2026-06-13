// @targets c
// @expect pass

async function work(): Promise<string> {
  try {
    const prefix: string = 'Ada'
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix)
    }
    console.log(prefix)
    return prefix
  } finally {
    console.log('outer')
  }
}

const promise = work()
console.log(await promise)

