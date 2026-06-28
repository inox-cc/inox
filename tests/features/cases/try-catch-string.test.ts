// @targets cc
// @expect pass
// @stdout bad

try {
throw 'bad'
} catch (error) {
console.log(error)
}
