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
  const constraint = constraints[0]

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
