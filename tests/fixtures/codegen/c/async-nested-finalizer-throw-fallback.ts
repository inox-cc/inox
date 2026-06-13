// @targets c
// @expect pass

async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(1)
      return value
    } finally {
      throw 'finally fail'
    }
  } catch (error) {
    console.log(error)
    return 9
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
