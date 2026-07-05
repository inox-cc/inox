// @targets cc
// @expect pass
// @stdout url example.com /docs q=inox&kind=simple

import { URL, URLSearchParams } from 'node:url'

const page = new URL('/docs?q=smoke', 'https://example.com/base')
const params = new URLSearchParams({ q: 'smoke' })

params.set('q', 'inox')
params.append('kind', 'simple')

console.log('url', page.hostname, page.pathname, params.toString())
