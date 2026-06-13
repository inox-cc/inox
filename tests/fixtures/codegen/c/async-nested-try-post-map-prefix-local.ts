// @targets c
// @expect pass

async function work(): Promise<Map<string, number>> {
  try {
    const prefix: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.get('Ada') ?? 0)
    }
    console.log(prefix.get('Grace') ?? 0, prefix.size)
    return prefix
  } finally {
    console.log('outer')
  }
}

const result: Map<string, number> = await work()
console.log(result.get('Grace') ?? 0, result.size)

