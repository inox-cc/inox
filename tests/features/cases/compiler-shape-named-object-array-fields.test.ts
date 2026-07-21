// @targets cc
// @expect pass
// @stdout https://:tlsBackend:openssl:BRIDGE_TLS:request requires TLS

type PrefixBackendConstraint = {
  prefixes: string[]
  option: 'loopBackend' | 'tlsBackend'
  allowedValues: string[]
  diagnosticCode: string
  diagnosticMessage: string
}

function constraintFingerprint(constraints: PrefixBackendConstraint[]): string {
  const constraint = constraints[0]

  return (
    constraint.prefixes[0] +
    ':' +
    constraint.option +
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
      option: 'tlsBackend',
      allowedValues: ['openssl'],
      diagnosticCode: 'BRIDGE_TLS',
      diagnosticMessage: 'request requires TLS'
    }
  ])
)
