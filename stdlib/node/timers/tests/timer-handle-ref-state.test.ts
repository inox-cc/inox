// @targets js cc
// @expect pass
// @stdout yes no yes
// @stdout later

const timeout = setTimeout(() => {
  console.log('later')
})

const initial = timeout.hasRef()
timeout.unref()
const unreferenced = timeout.hasRef()
timeout.ref()
console.log(initial ? 'yes' : 'no', unreferenced ? 'yes' : 'no', timeout.hasRef() ? 'yes' : 'no')
