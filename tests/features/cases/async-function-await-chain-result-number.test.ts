// @targets cc
// @expect pass
// @stdout 8

async function read(): Promise<number> {
  const value = await Promise.resolve(7).then((item) => item + 1)
  return value
}

console.log(await read())
