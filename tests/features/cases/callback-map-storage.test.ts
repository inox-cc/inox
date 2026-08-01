// @targets cc
// @expect pass

type Callback = () => void

const callbacks = new Map<string, Callback>()
callbacks.set('value', () => {})

for (const callback of callbacks.values()) {
  callback()
}
