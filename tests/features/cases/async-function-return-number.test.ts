// @targets cc
// @expect pass
// @stdout 7

async function read(): Promise<number> {
  return 7
}

const value = await read()
console.log(value)
