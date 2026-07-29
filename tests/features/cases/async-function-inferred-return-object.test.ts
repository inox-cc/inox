// @targets cc
// @expect pass
// @stdout ready

async function read() {
  return { status: 'ready' }
}

const result = await read()
console.log(result.status)
