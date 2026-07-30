// @targets cc
// @expect pass
// @stdout failure
// @stdout success

type Success = {
  ok: true
  value: string
  error?: string
}

type Failure = {
  ok: false
  value?: string
  error: string
}

type Result = Success | Failure

function unwrap(result: Result): string {
  if (!result.ok) {
    return result.error
  }

  return result.value
}

console.log(unwrap({ ok: false, error: 'failure' }))
console.log(unwrap({ ok: true, value: 'success' }))
