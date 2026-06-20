// @targets c
// @expect pass
// @stdout module:Ada:13:core
// @stdout alias:Grace=13

import { sourceName as aliasName, starter } from './modules/profile.ts'
import { indexName } from './modules/indexed'
import { addScore, describe } from './modules/scoring.ts'
import type { SmokeProfile } from './modules/types.ts'

const profile: SmokeProfile = addScore(starter, 6)

console.log('module:' + profile.name + ':' + String(profile.score) + ':' + indexName)
console.log('alias:' + describe(aliasName, profile.score))
