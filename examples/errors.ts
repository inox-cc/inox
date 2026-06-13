// @targets c
// @expect pass
// @stdout recovered

function fail(): void {
  throw 'failed'
}

try {
  fail()
} catch (error) {
  console.log('recovered')
}
