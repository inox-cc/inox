// @targets cc
// @expect diagnostics INOX_TIMER_REF_UNREF

const handle = setTimeout(() => {}, 0)
handle.ref()
