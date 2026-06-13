// @targets c
// @expect pass

async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const total: number = value + 4
      console.log(total)
    } finally {
      console.log('inner')
    }
    console.log('after')
    return 9
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  console.log(await work())
}
