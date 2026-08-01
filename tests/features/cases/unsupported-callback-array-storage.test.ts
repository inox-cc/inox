// @targets cc
// @expect pass

const callbacks: Function[] = []
callbacks.push(() => {})

const callback = callbacks[0]
callback()
