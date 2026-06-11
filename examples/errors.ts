// @targets c
// @expect pass
// @stdout recovered

function fail(): void {
  throw 'failed'
}

export function main(): void {
  try {
    fail()
  } catch (error) {
    console.log('recovered')
  }
}
