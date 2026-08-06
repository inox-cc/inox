// @targets cc
// @expect pass
// @stdout nested

function run(): void {
  const values = ['nested']

  setTimeout(() => {
    setTimeout(() => {
      console.log(values[0])
    }, 0)
  }, 0)
}

run()
