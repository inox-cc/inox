// @targets c
// @expect pass
// @stdout true

type CheckResult = {
  ok: boolean
}

function checkCode(code: string): CheckResult {
  const supported = ['parse', 'check', 'emit']
  return {
    ok: supported.includes(code)
  }
}

const result = checkCode('emit')
console.log(`${result.ok}`)
