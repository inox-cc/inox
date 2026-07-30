// @targets cc
// @expect pass
// @stdout https://:bridge#secure-transport:openssl:BRIDGE_TLS:request requires TLS

type PrefixOptionConstraint = {
  prefixes: string[]
  optionId: string
  allowedValues: string[]
  diagnosticCode: string
  diagnosticMessage: string
}

function constraintFingerprint(constraints: PrefixOptionConstraint[]): string {
  if (constraints.length === 0) {
    return ''
  }

  const constraint = constraints[0]

  if (constraint.prefixes.length === 0 || constraint.allowedValues.length === 0) {
    return ''
  }

  return (
    constraint.prefixes[0] +
    ':' +
    constraint.optionId +
    ':' +
    constraint.allowedValues[0] +
    ':' +
    constraint.diagnosticCode +
    ':' +
    constraint.diagnosticMessage
  )
}

console.log(
  constraintFingerprint([
    {
      prefixes: ['https://'],
      optionId: 'bridge#secure-transport',
      allowedValues: ['openssl'],
      diagnosticCode: 'BRIDGE_TLS',
      diagnosticMessage: 'request requires TLS'
    }
  ])
)
