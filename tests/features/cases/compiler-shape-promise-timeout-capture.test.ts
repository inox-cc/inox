// @targets cc
// @expect pass
// @stdout capture:7

const prefix = 'capture'
const count = 7

const value = await new Promise((resolve) => {
  setTimeout(() => {
    resolve(`${prefix}:${count}`)
  }, 0)
})

console.log(value)
