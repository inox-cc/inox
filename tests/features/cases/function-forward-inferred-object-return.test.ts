// @targets cc
// @expect pass
// @stdout ready 2

type Result = {
  name: string
  count: number
}

const result: Result = createResult()

console.log(`${result.name} ${result.count}`)

function createResult() {
  return {
    name: 'ready',
    count: 2
  }
}
