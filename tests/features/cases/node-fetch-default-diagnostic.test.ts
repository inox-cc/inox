// @targets c
// @expect diagnostics INOX_NOT_IMPLEMENTED

const response = await fetch('http://127.0.0.1')
console.log(await response.text())
