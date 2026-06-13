// @targets c
// @expect diagnostic
// @diagnostic CCJS_C_ASYNC

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

export async function main(): Promise<void> {
  console.log(await work())
}
