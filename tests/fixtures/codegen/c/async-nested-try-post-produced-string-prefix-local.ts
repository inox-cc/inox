// @targets c
// @expect pass

async function work(count: number): Promise<string> {
  try {
    const prefix: string = String(count)
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix)
    }
    console.log(prefix)
    return prefix
  } finally {
    console.log(count)
  }
}

const promise = work(4)
console.log(await promise)

