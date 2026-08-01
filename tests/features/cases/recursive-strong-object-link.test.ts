// @targets cc
// @expect pass
// @stdout second

type Link = {
  name: string
  next: Link | null
}

const link: Link = {
  name: 'first',
  next: {
    name: 'second',
    next: null
  }
}

console.log(link.next?.name ?? 'missing')
