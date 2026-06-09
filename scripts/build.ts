import { collectRepoChecks, formatFailures } from './lib/repo-checks.ts'

const failures = await collectRepoChecks()

if (failures.length > 0) {
  console.error(formatFailures('Build checks failed', failures))
  process.exitCode = 1
} else {
  console.log('Build checks passed')
}
