// @targets cc
// @expect diagnostics INOX_FETCH

const response = await fetch('http://127.0.0.1')
await response.arrayBuffer()
