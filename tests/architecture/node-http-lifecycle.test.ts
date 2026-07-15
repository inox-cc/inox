import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

test('node:http держит managed state и вызывает lifecycle callbacks по фактическим completions', async () => {
  const source = await readFile('stdlib/node/http/src/http.cc', 'utf8')
  const compilerFiles = await readdir('stdlib/node/http/compiler')
  const compiler = (
    await Promise.all(
      compilerFiles
        .filter((file) => file.endsWith('.ts'))
        .map((file) => readFile(`stdlib/node/http/compiler/${file}`, 'utf8'))
    )
  ).join('\n')

  assert.match(source, /std::shared_ptr<HttpServerState>/)
  assert.match(source, /std::shared_ptr<HttpRequestState>/)
  assert.match(source, /std::shared_ptr<HttpResponseState>/)
  assert.match(source, /std::vector<inox::Callback>\s+request_listeners_;/)
  assert.match(source, /request_listeners_\.push_back\(std::move\(listener\)\)/)
  assert.match(source, /std::vector<inox::Callback>\s+listeners\s*=\s*[^;]*request_listeners_;/)
  assert.match(source, /for\s*\(const inox::Callback& listener : listeners\)/)
  assert.match(source, /inox_class_instance_ref_(?:new|copy)\(/)
  assert.match(source, /bool\s+request_dispatched_;/)
  assert.match(source, /if\s*\([^)]*request_dispatched_\)/)
  assert.match(source, /request_dispatched_\s*=\s*true;/)
  assert.match(source, /net_server_?\.listen\([^;]*std::move\(callback\)\)/)
  assert.match(source, /net_server_?\.close\(std::move\(callback\)\)/)

  assert.match(compiler, /callbackLifetime:\s*'event-loop'/)
  assert.doesNotMatch(compiler, /emitHttpZeroArgCallbackLines|emitHttpServerListenLines|emitHttpServerCloseLines/)
})
