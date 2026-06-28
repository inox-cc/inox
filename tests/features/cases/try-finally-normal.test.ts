// @targets cc
// @expect pass
// @stdout try
// @stdout finally

try {
  console.log('try')
} finally {
  console.log('finally')
}
