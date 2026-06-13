// @targets c
// @expect pass

async function work(): Promise<number> {
  try {
    const seed: number = 3
    try {
      const value: number = await Promise.resolve(seed)
      return value
    } finally {
      console.log('outer finally')
    }
  } finally {
    console.log('done')
  }
}

const promise = work()
console.log(await promise)

