// @targets c
// @expect pass

async function work(): Promise<number> {
  try {
    const seed: number = 4
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log('inner finally')
    }
    const total: number = seed + 5
    console.log(total)
    return seed
  } finally {
    console.log('outer finally')
  }
}

const promise = work()
console.log(await promise)

