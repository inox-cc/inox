// @targets cc
// @expect pass
// @stdout 7

async function read() {
  return Promise.resolve(7)
}

console.log(await read())
