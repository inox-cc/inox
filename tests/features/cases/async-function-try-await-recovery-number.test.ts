// @targets cc
// @expect pass
// @stdout 8

async function recover(): Promise<number> {
  try {
    const value = await Promise.resolve(8)
    return value
  } catch (error) {
    return 9
  }
}

console.log(await recover())
