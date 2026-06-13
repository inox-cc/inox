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
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
