// @targets c
// @expect diagnostics INOX_NOT_IMPLEMENTED

import url from 'node:url'
url.parse('https://example.com')
