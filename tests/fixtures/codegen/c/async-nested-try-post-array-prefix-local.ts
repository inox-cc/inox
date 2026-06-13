// @targets c
// @expect pass

async function work(): Promise<Array<number>> {
  try {
    const prefix: number[] = [2, 4]
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.length)
    }
    console.log(prefix[1])
    return prefix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  const result: number[] = await promise
  console.log(result[0], result[1])
}
