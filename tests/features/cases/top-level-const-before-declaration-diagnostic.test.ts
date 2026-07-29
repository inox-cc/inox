// @targets cc
// @expect diagnostics INOX_UNKNOWN_NAME

console.log(settings.status)

const settings = { status: 'ready' }
