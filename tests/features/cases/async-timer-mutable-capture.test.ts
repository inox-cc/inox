// @targets cc
// @expect pass
// @stdout after await

function schedule(): void {
  let message = 'before await'

  setTimeout(async () => {
    await Promise.resolve()
    console.log(message)
  }, 0)

  message = 'after await'
}

schedule()
