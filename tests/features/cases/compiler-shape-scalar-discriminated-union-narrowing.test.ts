// @targets cc
// @expect pass
// @stdout ready
// @stdout 3

type TextResult = {
  kind: 'text'
  text: string
  count?: number
}

type CountResult = {
  kind: 'count'
  text?: string
  count: number
}

type Result = TextResult | CountResult

function describe(result: Result): string {
  if (result.kind === 'text') {
    return result.text
  }

  return `${result.count}`
}

console.log(describe({ kind: 'text', text: 'ready' }))
console.log(describe({ kind: 'count', count: 3 }))
