// @targets c
// @expect pass

async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
      return value
    } finally {
      console.log('inner finally')
    }
  } catch (error) {
    console.log(error)
    return 7
  }
}

const promise = work()
console.log(await promise)

