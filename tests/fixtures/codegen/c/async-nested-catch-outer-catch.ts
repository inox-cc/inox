// @targets c
// @expect pass

async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
      return value
    } catch (error) {
      console.log(error)
      return 7
    }
  } catch (error) {
    console.log(error)
    return 9
  }
}

const promise = work()
console.log(await promise)

