import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('node:fs Promise и callback API завершаются общим native request lifecycle', async () => {
  const header = await readFile('stdlib/node/fs/include/inox/fs.h', 'utf8')
  const source = await readFile('stdlib/node/fs/src/fs.cc', 'utf8')

  assert.match(header, /#include "inox\/callback\.h"/)
  assert.match(header, /void readFile\(inox::StringView path, inox::Callback callback\)/)
  assert.match(source, /struct FsRequest[\s\S]*inox::Callback callback/)
  assert.match(source, /struct FsLibuvRequest[\s\S]*inox::Callback callback/)
  assert.match(source, /inox_fs_complete_value\([\s\S]*callback\.call\(/)
  assert.doesNotMatch(source, /\.then\(/)
})
