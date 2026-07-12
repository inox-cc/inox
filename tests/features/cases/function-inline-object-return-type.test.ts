// @targets cc
// @expect pass
// @stdout inline

function createResult(value: string): { value: string } {
  return { value }
}

const result = createResult('inline')
console.log(result.value)
