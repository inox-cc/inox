// @targets c
// @expect pass

async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const total: number = value + 4
      console.log(total)
      return total
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

console.log(await work())

