// @targets c
// @expect pass

async function work(): Promise<Set<string>> {
  try {
    const prefix: Set<string> = new Set(['Ada', 'Grace'])
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.has('Ada'))
    }
    console.log(prefix.has('Grace'), prefix.size)
    return prefix
  } finally {
    console.log('outer')
  }
}

const result: Set<string> = await work()
console.log(result.has('Grace'), result.size)

