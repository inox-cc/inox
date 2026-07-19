// @targets cc
// @expect pass
// @stdout 7

async function read(): Promise<number> {
  const value = await Promise.resolve(7)
  return value
}

console.log(await read())
