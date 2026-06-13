// @targets c
// @expect pass

async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log('inner finally')
    }
    console.log('after inner')
    return 7
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
