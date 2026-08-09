import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { rootDir } from '../../scripts/lib/repo-root.ts'
import { runCommand } from '../../scripts/lib/run-command.ts'

export type CryptoEncodingCompiler = {
  args: string[]
  command: string
  label: string
}

const resultPrefix = 'INOX_CRYPTO_ENCODING '
const expectedResult = [
  'j0NDRmSPa5bfid2pAcUXaxCm2Dlh3TwayItZstwyeqQ=',
  'j0NDRmSPa5bfid2pAcUXaxCm2Dlh3TwayItZstwyeqQ',
  '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
  '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
  'HJ3ILl+OXtWgGAqtM7ggTeoS/eL7Yv+16WMDW/Mkp6Q=',
  '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4'
].join(' ')

const source = `import { Buffer } from 'node:buffer'
import { createHash, createHmac, hash } from 'node:crypto'

const base64 = hash('sha256', 'hi', 'base64')
const base64url = hash('sha256', 'hi', 'base64url')
const decodedText = createHash('sha256').update('aGk=', 'base64').digest('hex')
const bytes = createHash('sha256').update(Buffer.from('hi'), 'hex').digest('hex')
const hmac = createHmac('sha256', 'key').update('aGk=', 'base64').digest('base64')
const raw = hash('sha256', 'hi', 'buffer').toString('hex')

console.log('${resultPrefix.trim()}', base64, base64url, decodedText, bytes, hmac, raw)
`

export async function assertCryptoEncodingRuntime(compiler: CryptoEncodingCompiler): Promise<void> {
  await assertCryptoRuntime(compiler, 'encoding', source, resultPrefix, [`${resultPrefix}${expectedResult}`])
}

export async function assertCryptoRuntime(
  compiler: CryptoEncodingCompiler,
  caseName: string,
  programSource: string,
  resultLinePrefix: string,
  expectedLines: string[]
): Promise<void> {
  const workspace = join(rootDir, `dist/test-tmp/crypto-${caseName}-runtime-${compiler.label}`)
  const input = join(workspace, 'index.ts')
  const output = join(workspace, 'output')

  try {
    await rm(workspace, { recursive: true, force: true })
    await mkdir(workspace, { recursive: true })
    await writeFile(input, programSource)

    const result = await runCommand(compiler.command, [
      ...compiler.args,
      'run',
      input,
      '--out-dir',
      output,
      '--name',
      'crypto-encoding-runtime'
    ])

    assert.equal(
      result.code,
      0,
      `${compiler.label} crypto ${caseName} runtime failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    )
    assert.equal(result.stderr, '')

    const resultLines = result.stdout.split('\n').filter((line) => line.startsWith(resultLinePrefix))

    assert.deepEqual(resultLines, expectedLines)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}
