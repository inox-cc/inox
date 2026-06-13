// @targets c
// @expect pass
// @stdout async recovered

async function failLater(): Promise<number> {
  throw 'boom'
}

try {
  const value = await failLater()
  console.log(value)
} catch (error) {
  console.log('async recovered')
}
