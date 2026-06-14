// @targets c
// @expect pass

try {
  throw new Error('boom')
} catch (error) {
  console.log(error.message)
}

