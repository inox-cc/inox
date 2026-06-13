// @targets c
// @expect pass

async function work(): Promise<number> {
  try {
    console.log('outer prefix')
    try {
      console.log('middle prefix')
      try {
        const value: number = await Promise.resolve(3)
        return value
      } finally {
        console.log('inner finally')
      }
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
