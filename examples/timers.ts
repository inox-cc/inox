// @targets c
// @expect pass
// @stdout immediate

function printImmediate(): void {
  console.log('immediate')
}

export function main(): void {
  const timeout = setTimeout(printImmediate, 1)
  clearTimeout(timeout)
  setImmediate(printImmediate)
}
