// @targets c
// @expect diagnostic
// @diagnostic INOX_C_ASYNC

async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
      return value
    } catch (error) {
      throw 'catch fail'
    }
  } catch (error) {
    console.log(error)
    return 9
  }
}

console.log(await work())

