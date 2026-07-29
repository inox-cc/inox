// @targets cc
// @expect pass
// @stdout caught

async function fail(): Promise<string> {
  throw new Error('failed')
}

function forward(): Promise<string> {
  return fail()
}

try {
  console.log(await forward())
} catch {
  console.log('caught')
}
