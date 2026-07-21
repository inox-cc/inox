// @targets cc
// @expect pass
// @stdout diagnostic

function printDiagnostics(value: any): void {
  if (
    value !== null &&
    typeof value !== 'undefined' &&
    value.diagnostics !== null &&
    typeof value.diagnostics !== 'undefined'
  ) {
    console.log('diagnostic')
    return
  }

  console.log('missing')
}

printDiagnostics({ diagnostics: [{ message: 'diagnostic' }] })
