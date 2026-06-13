// @targets c
// @expect pass

async function work(): Promise<number> {
  try {
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
    } finally {
      console.log('middle finally')
    }
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
