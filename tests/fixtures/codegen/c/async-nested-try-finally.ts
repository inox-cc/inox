// @targets c
// @expect pass

async function compute(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      return value
    } finally {
      console.log('inner finally')
    }
  } finally {
    console.log('outer finally')
  }
}

const promise = compute()
console.log(await promise)

