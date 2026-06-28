// @targets cc
// @expect pass
// @stdout selected:ok

type Diagnostic = {
  code: string
}

function maybeDiagnostic(enabled: boolean): Diagnostic | null {
  return enabled ? { code: 'ok' } : null
}

const diagnostic = maybeDiagnostic(true)

if (diagnostic) {
  console.log(`selected:${diagnostic.code}`)
} else {
  console.log('selected:none')
}
