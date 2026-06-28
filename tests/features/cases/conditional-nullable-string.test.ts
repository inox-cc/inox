// @targets cc
// @expect pass
// @stdout yes

const enabled = true
const value = enabled ? 'yes' : null

if (value !== null) {
  console.log(value)
}
