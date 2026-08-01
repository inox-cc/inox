// @targets cc
// @expect pass
// @stdout stored async

type Host = {
  read(value: string): Promise<string>
}

async function read(value: string): Promise<string> {
  return value
}

const host: Host = { read }
const value = await host.read('stored async')
console.log(value)
