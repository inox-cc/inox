// @targets cc
// @expect diagnostics INOX_TYPE_MISMATCH

type TextResult = {
  kind: 'text'
  text: string
}

type CountResult = {
  kind: 'count'
  count: number
}

type Result = TextResult | CountResult

function consume(result: Result): void {}

consume({ kind: 'other', text: 'invalid' })
