// @targets cc
// @expect pass
// @stdout done

setTimeout(() => {
  if (Date.now() > 0) {
    console.log('done')
    return
  }

  const later = 'a' === 'a'
  console.log(later)
}, 0)
