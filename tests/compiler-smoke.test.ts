import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { emitCBundleFromIrModules, emitCFromIr } from '../src/compiler/codegen-c.ts'
import { emitJsBundleFromIrModules, emitJsFromIr } from '../src/compiler/codegen-js.ts'
import { CompileError } from '../src/compiler/diagnostics.ts'
import { compileFile, compileSource } from '../src/compiler/index.ts'
import {
  collectIrFeatureRequirements,
  collectIrFunctionEffects,
  collectIrFunctionNodeEntries,
  collectIrGlobalRoots,
  collectIrLocalThrowValueTypes,
  collectIrModuleRecords,
  collectIrPrograms,
  collectIrTopLevelNodeEntries,
  collectIrTopLevelNodesFromPrograms,
  findIrEntryProgram
} from '../src/compiler/ir.ts'
import type { CompileTarget } from '../src/compiler/types.ts'

const strictAssertMatch = assert.match.bind(assert)

assert.match = ((actual: string, expected: RegExp, message?: string | Error): void => {
  try {
    strictAssertMatch(actual, expected, message)
  } catch (error) {
    strictAssertMatch(actual, loosenPatternWhitespace(expected), message)
  }
}) as typeof assert.match

function loosenPatternWhitespace(pattern: RegExp): RegExp {
  const source = pattern.source
    .replace(/\\\*/g, String.raw`\s*\*\s*`)
    .replace(/\\\(/g, String.raw`\(\s*`)
    .replace(/\\\)/g, String.raw`\s*\)`)
    .replace(/(?<!\\)\\n/g, String.raw`\s*`)
    .replace(/ \{(\d+(?:,\d*)?)\}/g, String.raw`\s*`)
    .replace(/ /g, String.raw`\s*`)
    .replace(/\\s\*\\\)/g, String.raw`\s*\)\s*(?:\{\s*)?`)
    .replace(/\\s[*+]((?:goto|return|break|continue)\b)/g, String.raw`\s*(?:\{\s*)?$1`)
    .replace(/;/g, String.raw`;\s*(?:\}\s*)?`)

  return new RegExp(source, pattern.flags)
}

test('compiles exported main to runnable JS', () => {
  const result = compileSource(
    `export function main(): void {
  console.log('hello')
}
`,
    {
      target: 'js'
    }
  )

  assert.match(result.code, /export function main\(\)/)
  assert.match(result.code, /console\.log\("hello"\)/)
  assert.match(result.code, /await ccjsMainResult/)
})

test('emits C for a minimal console program', () => {
  const result = compileSource(
    `export function main(): void {
  const name = 'Ada'
  console.log('hello', name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include <stdio\.h>/)
  assert.match(result.code, /#include "ccjs\/console\.h"/)
  assert.match(result.code, /const char \*name = "Ada";/)
  assert.match(result.code, /printf\("%s %s\\n", "hello", name\);/)
})

test('emits C console warn and error through stderr runtime stream', () => {
  const result = compileSource(
    `console.warn('heads up')
console.error('failed')
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include "ccjs\/console\.h"/)
  assert.match(result.code, /ccjs_console_printf\(CCJS_CONSOLE_STDERR, "%s\\n", "heads up"\)/)
  assert.match(result.code, /ccjs_console_printf\(CCJS_CONSOLE_STDERR, "%s\\n", "failed"\)/)
})

test('emits C dgram runtime include for node:dgram imports', () => {
  const result = compileSource(
    `import dgram from 'node:dgram'

export function main(): void {
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include "ccjs\/dgram\.h"/)
})

test('lowers node:dgram message echo sockets to the C dgram runtime', () => {
  const result = compileSource(
    `import dgram from 'node:dgram'

const server = dgram.createSocket('udp4')
server.on('message', (message, rinfo) => {
  server.send(message, rinfo.port, rinfo.address)
})
server.bind(0, '127.0.0.1', () => {
  const address = server.address()
  console.log(address.port)
})
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /static ccjs_status ccjs_dgram_message_handler_\d+\(void\* user, ccjs_dgram_socket\* ccjs_socket, const char\* ccjs_bytes, size_t ccjs_len, const char\* ccjs_host, int ccjs_port\);/)
  assert.match(result.code, /ccjs_dgram_socket_new\(&ccjs_loop, 0, 0, &server\)/)
  assert.match(result.code, /ccjs_dgram_socket_on_message\(server, ccjs_dgram_message_handler_\d+, 0\)/)
  assert.match(result.code, /ccjs_dgram_bind_flags\(server, "127\.0\.0\.1", \(int\)\(0\), 0\)/)
  assert.match(result.code, /ccjs_dgram_recv_start\(server\)/)
  assert.match(result.code, /ccjs_dgram_send\(ccjs_socket, ccjs_bytes, ccjs_len, ccjs_host, \(int\)\(ccjs_port\)\)/)
  assert.match(result.code, /ccjs_dgram_socket_address\(server, &address\)/)
  assert.match(result.code, /printf\("%g\\n", \(\(double\)address\.port\)\)/)
})

test('lowers node:dgram createSocket and bind option objects with keyword keys', () => {
  const result = compileSource(
    `import { createSocket } from 'node:dgram'

const socket = createSocket({ type: 'udp4' })
socket.bind({ port: 0, address: '127.0.0.1' })
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_dgram_socket_new\(&ccjs_loop, 0, 0, &socket\)/)
  assert.match(result.code, /ccjs_dgram_bind_flags\(socket, "127\.0\.0\.1", \(int\)\(0\), 0\)/)
})

test('lowers node:dgram connected UDP helpers to the C dgram runtime', () => {
  const result = compileSource(
    `import dgram from 'node:dgram'

const socket = dgram.createSocket('udp4')
socket.connect(41234, '127.0.0.1', () => {
  const remote = socket.remoteAddress()
  socket.send('hello')
  console.log(remote.port)
})
socket.disconnect()
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_dgram_socket_connect\(socket, "127\.0\.0\.1", \(int\)\(41234\)\)/)
  assert.match(result.code, /ccjs_dgram_socket_remote_address\(socket, &remote\)/)
  assert.match(result.code, /ccjs_dgram_send_connected\(socket, "hello", 5\)/)
  assert.match(result.code, /ccjs_dgram_socket_disconnect\(socket\)/)
})

test('lowers node:dgram socket options to the C dgram runtime', () => {
  const result = compileSource(
    `import dgram from 'node:dgram'

const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
socket.bind(0, '127.0.0.1')
socket.setBroadcast(false)
socket.setTTL(32)
socket.setSendBufferSize(4096)
socket.setRecvBufferSize(4096)
const sendSize = socket.getSendBufferSize()
const recvSize = socket.getRecvBufferSize()
socket.unref()
socket.ref()
console.log(sendSize, recvSize)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_dgram_bind_flags\(socket, "127\.0\.0\.1", \(int\)\(0\), CCJS_DGRAM_BIND_REUSEADDR\)/)
  assert.match(result.code, /ccjs_dgram_set_broadcast\(socket, 0 \? 1 : 0\)/)
  assert.match(result.code, /ccjs_dgram_set_ttl\(socket, \(int\)\(32\)\)/)
  assert.match(result.code, /ccjs_dgram_set_send_buffer_size\(socket, \(int\)\(4096\)\)/)
  assert.match(result.code, /ccjs_dgram_set_recv_buffer_size\(socket, \(int\)\(4096\)\)/)
  assert.match(result.code, /ccjs_dgram_get_send_buffer_size\(socket, &ccjs_dgram_buffer_size_\d+\)/)
  assert.match(result.code, /ccjs_dgram_get_recv_buffer_size\(socket, &ccjs_dgram_buffer_size_\d+\)/)
  assert.match(result.code, /ccjs_dgram_unref\(socket\)/)
  assert.match(result.code, /ccjs_dgram_ref\(socket\)/)
})

test('reports unsupported node:dgram compatibility shapes with dgram diagnostics', () => {
  assertDiagnostic(
    `import dgram from 'node:dgram'

const socket = dgram.createSocket('udp6')
`,
    'CCJS_DGRAM_SOCKET',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `import dgram from 'node:dgram'

const socket = dgram.createSocket('udp4')
socket.addMembership('224.0.0.1')
`,
    'CCJS_DGRAM_SOCKET',
    {
      target: 'c'
    }
  )
})

test('emits C net runtime include for node:net imports', () => {
  const result = compileSource(
    `import net from 'node:net'

export function main(): void {
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include "ccjs\/net\.h"/)
})

test('lowers node:net server lifecycle to the C net runtime', () => {
  const result = compileSource(
    `import net from 'node:net'

const server = net.createServer((socket) => {
  const greeting = 'hello'
  socket.end(greeting)
})
server.on('listening', () => {
  console.log('listening')
})
server.on('close', () => {
  console.log('closed')
})
server.on('error', () => {
  console.error('net error')
})
server.listen({ port: 0, host: '127.0.0.1', backlog: 16 }, () => {
  const address = server.address()
  console.log(address.address, address.family, address.port)
})
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /static ccjs_status ccjs_net_connection_handler_\d+\(void\* user, ccjs_net_server\* ccjs_server, ccjs_net_socket\* ccjs_socket\);/)
  assert.match(result.code, /static ccjs_status ccjs_net_event_handler_\d+\(void\* user, ccjs_net_server\* ccjs_server\);/)
  assert.match(result.code, /static ccjs_status ccjs_net_error_handler_\d+\(void\* user, ccjs_net_server\* ccjs_server, ccjs_status ccjs_error_status\);/)
  assert.match(result.code, /ccjs_net_server_new\(&ccjs_loop, ccjs_net_connection_handler_\d+, 0, &server\)/)
  assert.match(result.code, /ccjs_net_server_on_listening\(server, ccjs_net_event_handler_\d+, 0\)/)
  assert.match(result.code, /ccjs_net_server_on_close\(server, ccjs_net_event_handler_\d+, 0\)/)
  assert.match(result.code, /ccjs_net_server_on_error\(server, ccjs_net_error_handler_\d+, 0\)/)
  assert.match(result.code, /ccjs_net_server_listen\(server, "127\.0\.0\.1", \(int\)\(0\), \(int\)\(16\)\)/)
  assert.match(result.code, /ccjs_net_socket_end\(ccjs_socket, "hello", 5\)/)
  assert.match(result.code, /ccjs_net_address address;/)
  assert.match(result.code, /ccjs_net_server_address\(server, &address\)/)
  assert.match(result.code, /printf\("%s %s %g\\n", address\.address, address\.family, \(\(double\)address\.port\)\)/)
})

test('lowers chained node:net createServer listen calls', () => {
  const result = compileSource(
    `import { createServer } from 'node:net'

createServer((socket) => socket.end('ok')).listen(0, '127.0.0.1')
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_net_server\* ccjs_net_server_\d+ = 0;/)
  assert.match(result.code, /ccjs_net_server_new\(&ccjs_loop, ccjs_net_connection_handler_\d+, 0, &ccjs_net_server_\d+\)/)
  assert.match(result.code, /ccjs_net_server_listen\(ccjs_net_server_\d+, "127\.0\.0\.1", \(int\)\(0\), \(int\)\(128\)\)/)
  assert.match(result.code, /ccjs_net_socket_end\(ccjs_socket, "ok", 2\)/)
})

test('lowers node:net client sockets and events to the C net runtime', () => {
  const result = compileSource(
    `import { createConnection } from 'node:net'

const client = createConnection(9000, '127.0.0.1', () => {
  console.log('connected')
})
client.setEncoding('utf8')
client.on('ready', () => {
  client.write('ping', () => {
    console.log('sent')
  })
})
client.on('data', (chunk) => {
  console.log(chunk)
  client.end(chunk, () => {
    console.log('ended')
  })
})
client.on('end', () => {
  client.destroy()
})
client.on('close', () => {
  console.log('closed')
})
client.on('error', () => {
  console.error('failed')
})
client.on('drain', () => {
  console.log('drain')
})
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /static ccjs_status ccjs_net_socket_event_handler_\d+\(void\* user, ccjs_net_socket\* ccjs_socket\);/)
  assert.match(result.code, /static ccjs_status ccjs_net_socket_data_handler_\d+\(void\* user, ccjs_net_socket\* ccjs_socket, const char\* ccjs_bytes, size_t ccjs_len\);/)
  assert.match(result.code, /static ccjs_status ccjs_net_socket_write_handler_\d+\(void\* user, ccjs_net_socket\* ccjs_socket, ccjs_status ccjs_write_status\);/)
  assert.match(result.code, /static ccjs_status ccjs_net_socket_error_handler_\d+\(void\* user, ccjs_net_socket\* ccjs_socket, ccjs_status ccjs_error_status\);/)
  assert.match(result.code, /ccjs_net_connect\(&ccjs_loop, "127\.0\.0\.1", \(int\)\(9000\), 0, 0, 0, 0, &client\)/)
  assert.match(result.code, /ccjs_net_socket_on_connect\(client, ccjs_net_socket_event_handler_\d+, 0\)/)
  assert.match(result.code, /ccjs_net_socket_set_encoding\(client, "utf8", 4\)/)
  assert.match(result.code, /ccjs_net_socket_on_data\(client, ccjs_net_socket_data_handler_\d+, 0\)/)
  assert.match(result.code, /ccjs_net_socket_read_start\(client\)/)
  assert.match(result.code, /ccjs_net_socket_on_end\(client, ccjs_net_socket_event_handler_\d+, 0\)/)
  assert.match(result.code, /ccjs_net_socket_on_close\(client, ccjs_net_socket_event_handler_\d+, 0\)/)
  assert.match(result.code, /ccjs_net_socket_on_error\(client, ccjs_net_socket_error_handler_\d+, 0\)/)
  assert.match(result.code, /ccjs_net_socket_on_drain\(client, ccjs_net_socket_event_handler_\d+, 0\)/)
  assert.match(result.code, /ccjs_net_socket_write_with_callback\(ccjs_socket, "ping", 4, ccjs_net_socket_write_handler_\d+, 0\)/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)ccjs_len, ccjs_bytes\)/)
  assert.match(result.code, /ccjs_net_socket_end_with_callback\(ccjs_socket, ccjs_bytes, ccjs_len, ccjs_net_socket_write_handler_\d+, 0\)/)
  assert.match(result.code, /ccjs_net_socket_destroy\(ccjs_socket\)/)
})

test('lowers node:net socket address helpers and options to the C net runtime', () => {
  const result = compileSource(
    `import { connect } from 'node:net'

const client = connect(9000)
const local = client.address()
const remoteAddress = client.remoteAddress
const remotePort = client.remotePort
const localAddress = client.localAddress
const localPort = client.localPort
const bytesRead = client.bytesRead
const bytesWritten = client.bytesWritten
client.setNoDelay()
client.setNoDelay(false)
client.setKeepAlive(true, 10)
client.unref()
client.ref()
console.log(local.address, local.port, remoteAddress, remotePort, localAddress, localPort, bytesRead, bytesWritten)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_net_connect\(&ccjs_loop, "127\.0\.0\.1", \(int\)\(9000\), 0, 0, 0, 0, &client\)/)
  assert.match(result.code, /ccjs_net_address local;/)
  assert.match(result.code, /ccjs_net_socket_address\(client, &local\)/)
  assert.match(result.code, /ccjs_net_socket_remote_address\(client, &ccjs_net_address_\d+\)/)
  assert.match(result.code, /const char \*remoteAddress = ccjs_net_address_\d+\.address;/)
  assert.match(result.code, /remotePort = \(double\)ccjs_net_address_\d+\.port;/)
  assert.match(result.code, /ccjs_net_socket_address\(client, &ccjs_net_address_\d+\)/)
  assert.match(result.code, /const char \*localAddress = ccjs_net_address_\d+\.address;/)
  assert.match(result.code, /localPort = \(double\)ccjs_net_address_\d+\.port;/)
  assert.match(result.code, /ccjs_net_socket_get_bytes_read\(client, &ccjs_net_counter\)/)
  assert.match(result.code, /ccjs_net_socket_get_bytes_written\(client, &ccjs_net_counter\)/)
  assert.match(result.code, /ccjs_net_socket_set_no_delay\(client, 1 \? 1 : 0\)/)
  assert.match(result.code, /ccjs_net_socket_set_no_delay\(client, 0 \? 1 : 0\)/)
  assert.match(result.code, /ccjs_net_socket_set_keep_alive\(client, 1 \? 1 : 0, \(unsigned int\)\(10\)\)/)
  assert.match(result.code, /ccjs_net_socket_unref\(client\)/)
  assert.match(result.code, /ccjs_net_socket_ref\(client\)/)
  assert.match(result.code, /printf\("%s %g %s %g %s %g %g %g\\n"/)
})

test('reports unsupported node:net socket timeout with net diagnostics', () => {
  assertDiagnostic(
    `import net from 'node:net'

const client = net.connect(9000)
client.setTimeout(1000)
`,
    'CCJS_NET_SOCKET',
    {
      target: 'c'
    }
  )
})

test('emits C http runtime include for node:http imports', () => {
  const result = compileSource(
    `import http from 'node:http'

export function main(): void {
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include "ccjs\/http\.h"/)
})

test('lowers global fetch GET and response text to the C fetch runtime', () => {
  const result = compileSource(
    `const response = await fetch('http://127.0.0.1:9000/hello')
const text = await response.text()
console.log(response.status, response.ok, response.url, text)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include "ccjs\/fetch\.h"/)
  assert.match(result.code, /#include "ccjs\/object\.h"/)
  assert.match(result.code, /ccjs_fetch\(&ccjs_loop, "http:\/\/127\.0\.0\.1:9000\/hello", 27, &ccjs_promise_\d+\)/)
  assert.match(result.code, /ccjs_fetch_response_text\(&ccjs_loop, response, &ccjs_promise_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(response, 0, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(response, 1, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(response, 2, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /printf\("%g %g %\.\*s %\.\*s\\n"/)
})

test('lowers global fetch init options to the C fetch runtime', () => {
  const result = compileSource(
    `const response = await fetch('http://127.0.0.1:9000/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CCJS': 'fetch'
  },
  body: '{"name":"Ada"}'
})
console.log(response.status)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_fetch_header ccjs_fetch_headers_\d+\[2\] = \{ \{ "Content-Type", 12, "application\/json", 16 \}, \{ "X-CCJS", 6, "fetch", 5 \} \};/)
  assert.match(result.code, /ccjs_fetch_init ccjs_fetch_init_\d+ = \{ "POST", 4, ccjs_fetch_headers_\d+, 2, "\{\\"name\\":\\"Ada\\"\}", 14, ccjs_undefined_value\(\), 0, 0 \};/)
  assert.match(result.code, /ccjs_fetch_with_init\(&ccjs_loop, "http:\/\/127\.0\.0\.1:9000\/users", 27, &ccjs_fetch_init_\d+, &ccjs_promise_\d+\)/)
})

test('lowers fetch response metadata and headers helpers to the C fetch runtime', () => {
  const result = compileSource(
    `const response = await fetch('http://127.0.0.1:9000/hello?x=1', { redirect: 'manual' })
const headers = response.headers
const contentType = headers.get('content-type')
const hasTrace = response.headers.has('x-trace')
console.log(response.statusText, response.redirected, contentType ?? 'missing', hasTrace)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_fetch_init ccjs_fetch_init_\d+ = \{ 0, 0, 0, 0, 0, 0, ccjs_undefined_value\(\), "manual", 6 \};/)
  assert.match(result.code, /ccjs_object_get_known\(response, 5, &headers\)/)
  assert.match(result.code, /ccjs_fetch_headers_get\(&ccjs_default_allocator, headers, "content-type", 12, &ccjs_fetch_header_value_\d+\)/)
  assert.match(result.code, /contentType = ccjs_fetch_header_value_\d+;/)
  assert.match(result.code, /ccjs_object_get_known\(response, 5, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_fetch_headers_has\(ccjs_value_\d+, "x-trace", 7, &hasTrace\)/)
  assert.match(result.code, /ccjs_object_get_known\(response, 3, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(response, 4, &ccjs_log_value_\d+\)/)
})

test('lowers AbortController signal for fetch init to the C fetch runtime', () => {
  const result = compileSource(
    `const controller = new AbortController()
controller.abort()
const response = await fetch('http://127.0.0.1:9000/slow', { signal: controller.signal })
console.log(response.status)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_fetch_abort_controller_new\(&ccjs_default_allocator, &controller\)/)
  assert.match(result.code, /ccjs_fetch_abort_controller_abort\(controller\)/)
  assert.match(result.code, /ccjs_fetch_abort_controller_signal\(controller, &ccjs_fetch_signal_\d+\)/)
  assert.match(result.code, /ccjs_fetch_init ccjs_fetch_init_\d+ = \{ 0, 0, 0, 0, 0, 0, ccjs_fetch_signal_\d+, 0, 0 \};/)
  assert.match(result.code, /ccjs_fetch_with_init\(&ccjs_loop, "http:\/\/127\.0\.0\.1:9000\/slow", 26, &ccjs_fetch_init_\d+, &ccjs_promise_\d+\)/)
})

test('lowers fetch rejections to Error-like catch bindings in C', () => {
  const result = compileSource(
    `try {
  const response = await fetch('http://127.0.0.1:9000/slow')
  console.log(response.status)
} catch (error) {
  console.log(error)
  console.log('#error:', error)
  console.log(error.name, error.code)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /if \(ccjs_error\.tag != CCJS_TAG_OBJECT \|\| ccjs_error\.as\.ref == 0\) goto ccjs_cleanup;/)
  assert.match(result.code, /ccjs_value error = ccjs_error;/)
  assert.match(result.code, /printf\("%\.\*s: %\.\*s\\n"/)
  assert.match(result.code, /printf\("%s %\.\*s: %\.\*s\\n", "#error:"/)
  assert.doesNotMatch(result.code, /ccjs_string\* error = \(ccjs_string\*\)ccjs_error\.as\.ref;/)
})

test('lowers fetch awaits inside async task frames', () => {
  const result = compileSource(
    `async function load(): Promise<string> {
  const response = await fetch('http://127.0.0.1:9000/status', { method: 'HEAD' })
  return await response.text()
}

const text = await load()
console.log(text)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /status = ccjs_fetch_with_init\(ccjs_loop, "http:\/\/127\.0\.0\.1:9000\/status", 28, &ccjs_fetch_init_\d+, &frame->awaited\);/)
  assert.match(result.code, /ccjs_fetch_response_text\(ccjs_loop, response, &ccjs_promise_\d+\)/)
})

test('reports unsupported fetch init and response body helpers with fetch diagnostics', () => {
  assertDiagnostic(
    `const response = await fetch('http://127.0.0.1:9000/hello', { cache: 'no-store' })
console.log(response.status)
`,
    'CCJS_FETCH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `const response = await fetch('https://example.test/hello')
console.log(response.status)
`,
    'CCJS_FETCH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `const response = await fetch('http://127.0.0.1:9000/hello', { redirect: 'same-origin' })
console.log(response.status)
`,
    'CCJS_FETCH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `const response = await fetch('http://127.0.0.1:9000/hello')
const data = await response.json()
console.log(data)
`,
    'CCJS_FETCH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `const response = await fetch('http://127.0.0.1:9000/hello')
const data = await response.arrayBuffer()
console.log(data)
`,
    'CCJS_FETCH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `const response = await fetch('http://127.0.0.1:9000/hello')
console.log(response.body)
`,
    'CCJS_FETCH',
    {
      target: 'c'
    }
  )
})

test('accepts HTTPS fetch literals when a C TLS backend is enabled', () => {
  const result = compileSource(
    `const response = await fetch('https://example.test/hello')
console.log(response.status)
`,
    {
      target: 'c',
      tlsBackend: 'boringssl'
    }
  )

  assert.match(result.code, /ccjs_fetch\(&ccjs_loop, "https:\/\/example\.test\/hello", \d+, &ccjs_promise_\d+\)/)
})

test('lowers node:http createServer and listen to the C HTTP runtime', () => {
  const result = compileSource(
    `import http from 'node:http'

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ data: 'Hello World!' }))
})

server.listen(8080, '127.0.0.1')
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /static ccjs_status ccjs_http_handler_\d+\(void\* user, const ccjs_http_request\* ccjs_request, ccjs_http_response\* ccjs_response\);/)
  assert.match(result.code, /ccjs_http_server_new\(&ccjs_loop, ccjs_http_handler_\d+, 0, &server\)/)
  assert.match(result.code, /ccjs_http_server_listen\(server, "127\.0\.0\.1", \(int\)\(8080\), 128\)/)
  assert.match(result.code, /ccjs_http_response_write_head\(res, \(int\)\(200\), ccjs_http_headers_\d+, 1\)/)
  assert.match(result.code, /ccjs_http_response_end\(res, "\{\\\"data\\\":\\\"Hello World!\\\"\}", 23\)/)
})

test('lowers aliased node:http imports and request field checks for C', () => {
  const result = compileSource(
    `import nodeHttp from 'node:http'

const server = nodeHttp.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.statusCode = 204
    response.end()
  } else {
    response.setHeader('Content-Type', 'text/plain')
    response.write('missing')
    response.end(request.url)
  }
})

server.listen(9000)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_http_request_method_equals\(request, "GET", 3\)/)
  assert.match(result.code, /ccjs_http_request_url_equals\(request, "\/health", 7\)/)
  assert.match(result.code, /ccjs_http_response_set_status\(response, \(int\)\(204\)\)/)
  assert.match(result.code, /ccjs_http_response_set_header\(response, "Content-Type", 12, "text\/plain", 10\)/)
  assert.match(result.code, /ccjs_http_response_write\(response, "missing", 7\)/)
  assert.match(result.code, /ccjs_http_response_end\(response, request->url, request->url_len\)/)
  assert.match(result.code, /ccjs_http_server_listen\(server, 0, \(int\)\(9000\), 128\)/)
})

test('lowers node:http request event and lifecycle callbacks for C', () => {
  const result = compileSource(
    `import http from 'node:http'

const server = http.createServer()
server.on('request', (req, res) => {
  res.end('ok')
})

server.listen(8080, '127.0.0.1', () => {
  server.close(() => {})
})
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_http_server_new\(&ccjs_loop, 0, 0, &server\)/)
  assert.match(result.code, /ccjs_http_server_on_request\(server, ccjs_http_handler_\d+, 0\)/)
  assert.match(result.code, /ccjs_http_server_listen\(server, "127\.0\.0\.1", \(int\)\(8080\), 128\)/)
  assert.match(result.code, /ccjs_http_server_close\(server\);/)
})

test('compiles arrays, objects, member access and operators to JS', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { name: 'Ada', scores: [1, 2, 3] }
  const total = user.scores[0] + user['scores'][1] * 2
  console.log(user.name, total === 5 && true)
}
`,
    {
      target: 'js'
    }
  )

  assert.match(result.code, /const user = \{ name: "Ada", scores: \[1, 2, 3\] \}/)
  assert.match(result.code, /const total = \(user\.scores\[0\] \+ \(user\["scores"\]\[1\] \* 2\)\)/)
  assert.match(result.code, /console\.log\(user\.name, \(\(total === 5\) && true\)\)/)
})

test('parses string literals that look like operators', () => {
  const result = compileSource(
    `export function main(): void {
  const bang = '!'
  const plus = '+'
  const paren = '('
  console.log(bang, plus, paren)
}
`,
    {
      target: 'js'
    }
  )

  assert.match(result.code, /const bang = "!"/)
  assert.match(result.code, /const plus = "\+"/)
  assert.match(result.code, /const paren = "\("/)
  assert.match(result.code, /console\.log\(bang, plus, paren\)/)
})

test('emits C for numeric operators', () => {
  const result = compileSource(
    `export function main(): void {
  const value = 1 + 2 * 3
  console.log(value, value === 7)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /const double value = \(1 \+ \(2 \* 3\)\);/)
  assert.match(result.code, /printf\("%g %g\\n", \(\(double\)value\), \(\(double\)\(value == 7\)\)\);/)
})

test('treats double equality as strict equality aliases', () => {
  const source = `export function main(): void {
  const same = 1 == 1
  const different = 'Ada' != 'Grace'
  console.log(same, different)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /const same = \(1 === 1\)/)
  assert.match(js.code, /const different = \("Ada" !== "Grace"\)/)
  assert.match(c.code, /#include <string\.h>/)
  assert.match(c.code, /const double same = \(1 == 1\);/)
  assert.match(c.code, /const double different = \(!\(3 == 5 && memcmp\("Ada", "Grace", 3\) == 0\)\);/)
})

test('lowers C object literals to runtime calls', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { name: 'Ada', score: 42, active: true }
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include "ccjs\/object\.h"/)
  assert.match(result.code, /static const ccjs_field_info ccjs_shape_user_\d+_fields\[\]/)
  assert.match(result.code, /ccjs_value user = ccjs_undefined_value\(\);/)
  assert.match(result.code, /ccjs_object_new\(&ccjs_default_allocator/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "Ada", 3/)
  assert.match(result.code, /ccjs_object_init_known\(user, 1, ccjs_number_value\(42\)\)/)
  assert.match(result.code, /ccjs_object_init_known\(user, 2, ccjs_bool_value\(true\)\)/)
  assert.match(
    result.code,
    /ccjs_cleanup:\n {2}ccjs_release\(ccjs_value_\d+\);\n {2}ccjs_release\(user\);\n {2}return;/
  )
})

test('lowers synthetic C main wrapper through cleanup when runtime values are owned', () => {
  const result = compileSource(
    `const user = { name: 'Ada' }
console.log('ok')
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /int main\(void\) \{/)
  assert.match(
    result.code,
    /if \(ccjs_object_new\(&ccjs_default_allocator, &ccjs_shape_user_\d+, &user\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /ccjs_cleanup:\n {2}ccjs_release\(ccjs_value_\d+\);\n {2}ccjs_release\(user\);\n {2}return \(int\)ccjs_return;/
  )
})

test('lowers C void return through cleanup when runtime values are owned', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { name: 'Ada' }
  return
  console.log('unreachable')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /goto ccjs_cleanup;/)
  assert.match(
    result.code,
    /ccjs_cleanup:\n {2}ccjs_release\(ccjs_value_\d+\);\n {2}ccjs_release\(user\);\n {2}return;/
  )
})

test('lowers C number returns through cleanup when runtime values are owned', () => {
  const result = compileSource(
    `function getScore(): number {
  const user = { score: 42 }
  const score = user.score
  return score
}

export function main(): void {
  console.log(getScore())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /double getScore\(void\) \{\n {2}double ccjs_return = 0;/)
  assert.match(result.code, /ccjs_return = score;\n {2}goto ccjs_cleanup;/)
  assert.match(
    result.code,
    /ccjs_cleanup:\n {2}ccjs_release\(ccjs_field_\d+\);\n {2}ccjs_release\(user\);\n {2}return ccjs_return;/
  )
})

test('lowers C array literals to runtime calls', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1, 2, 3]
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include "ccjs\/array\.h"/)
  assert.match(result.code, /ccjs_value values = ccjs_undefined_value\(\);/)
  assert.match(result.code, /ccjs_array_new\(&ccjs_default_allocator, 3, &values\)/)
  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_number_value\(1\)\)/)
  assert.match(result.code, /ccjs_array_set\(values, 2, ccjs_number_value\(3\)\)/)
})

test('lowers C array length for known arrays', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1, 2, 3]
  console.log(values.length, [4, 5].length)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /printf\("%g %g\\n", \(\(double\)3\), \(\(double\)2\)\);/)
})

test('lowers C runtime array length for object fields', () => {
  const result = compileSource(
    `type Box = {
  values: number[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3] }
  console.log(box.values.length)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_array_new\(&ccjs_default_allocator, 3, &ccjs_array_\d+\)/)
  assert.match(result.code, /ccjs_object_init_known\(box, 0, ccjs_array_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(box, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_len\(ccjs_value_\d+, &ccjs_array_len_\d+\)/)
})

test('lowers C runtime array index reads for object fields', () => {
  const result = compileSource(
    `type Box = {
  values: number[],
  flags: boolean[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3], flags: [true], names: ['Ada'] }
  const name = box.names[0]
  console.log(box.values[1], box.flags[0], name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(box, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(ccjs_value_\d+, 1, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(box, 1, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(ccjs_value_\d+, 0, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(box, 2, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(ccjs_value_\d+, 0, &ccjs_value_\d+\)/)
  assert.match(
    result.code,
    /printf\("%g %g %\.\*s\\n", ccjs_log_value_\d+\.as\.number, \(\(double\)\(ccjs_log_value_\d+\.as\.boolean \? 1 : 0\)\), \(int\)name->len, name->bytes\);/
  )
})

test('lowers C runtime array locals from object fields', () => {
  const result = compileSource(
    `type Box = {
  values: number[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3], names: ['Ada'] }
  const values = box.values
  const names = box.names
  console.log(values[1], names[0])
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(box, 0, &values\)/)
  assert.match(result.code, /values\.tag != CCJS_TAG_ARRAY/)
  assert.match(result.code, /ccjs_object_get_known\(box, 1, &names\)/)
  assert.match(result.code, /names\.tag != CCJS_TAG_ARRAY/)
  assert.match(result.code, /ccjs_array_get\(values, 1, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(names, 0, &ccjs_log_value_\d+\)/)
})

test('lowers C for of over runtime array locals', () => {
  const result = compileSource(
    `type Box = {
  values: number[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3], names: ['Ada', 'Grace'] }
  const values = box.values
  const names = box.names
  let total = 0
  let letters = 0
  for (const value of values) {
    total = total + value
  }
  for (const name of names) {
    letters = letters + name.length
  }
  console.log(total, letters)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_array_len\(values, &ccjs_for_length_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, ccjs_for_index_\d+, &ccjs_for_value_\d+\)/)
  assert.match(result.code, /ccjs_array_len\(names, &ccjs_for_length_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(names, ccjs_for_index_\d+, &ccjs_for_value_\d+\)/)
  assert.match(result.code, /ccjs_for_value_\d+\.tag != CCJS_TAG_STRING/)
})

test('lowers C for of over runtime array expressions', () => {
  const result = compileSource(
    `type Box = {
  values: number[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [1, 2, 3], names: ['Ada', 'Grace'] }
  let total = 0
  let letters = 0
  for (const value of box.values) {
    total = total + value
  }
  for (const name of box.names) {
    letters = letters + name.length
  }
  console.log(total, letters)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(box, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_len\(ccjs_value_\d+, &ccjs_for_length_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(ccjs_value_\d+, ccjs_for_index_\d+, &ccjs_for_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(box, 1, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_for_value_\d+\.tag != CCJS_TAG_STRING/)
})

test('lowers C array methods over runtime array object fields', () => {
  const result = compileSource(
    `type Box = {
  values: number[],
  names: string[]
}

export function main(): void {
  const box: Box = { values: [3, 1, 2], names: ['Grace', 'Ada'] }
  box.values.push(4)
  const last = box.values.pop() ?? 0
  const numbers = box.values.sort((left, right) => left - right).filter(value => value !== 2)
  const initials = box['names'].map(name => name.slice(0, 1)).sort()
  console.log(last, numbers.length, numbers[0], numbers[1], initials.length, initials[0], initials[1])
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(box, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_push\(ccjs_value_\d+, ccjs_number_value\(4\)\)/)
  assert.match(result.code, /ccjs_array_pop\(ccjs_value_\d+, &ccjs_array_pop_\d+\)/)
  assert.match(result.code, /ccjs_array_len\(ccjs_value_\d+, &ccjs_sort_length_\d+\)/)
  assert.match(result.code, /ccjs_array_push\(ccjs_filter_array_\d+, ccjs_filter_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get\(box, "names", 5, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_slice_parts\(/)
  assert.match(result.code, /ccjs_array_sort\(ccjs_map_array_\d+\)/)
})

test('lowers C string length for literals and runtime strings', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function length(name: string): number {
  return name.length
}

function getName(): string {
  return 'Grace'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + '!'
  console.log('Ada'.length, length(name), user.name.length, getName().length, message.length)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include <string\.h>/)
  assert.match(result.code, /ccjs_string_code_point_length_parts\(name->bytes, name->len\)/)
  assert.match(result.code, /ccjs_return = \(\(double\)ccjs_string_length_\d+\);/)
  assert.match(result.code, /ccjs_string \*ccjs_length_string_\d+ = \(ccjs_string \*\)ccjs_value_\d+\.as\.ref;/)
  assert.match(result.code, /ccjs_string_code_point_length_parts\("Ada", 3\)/)
  assert.match(
    result.code,
    /ccjs_string_code_point_length_parts\(ccjs_length_string_\d+->bytes, ccjs_length_string_\d+->len\)/
  )
  assert.match(result.code, /ccjs_string_code_point_length_parts\(message->bytes, message->len\)/)
})

test('lowers C string predicate methods for literals and runtime strings', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function hasAda(name: string): boolean {
  return name.includes('d') && name.startsWith('A') && name.endsWith('a')
}

function getName(): string {
  return 'Grace'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + '!'
  console.log('Ada'.includes('d'), hasAda(name), user.name.startsWith('A'), getName().endsWith('e'), message.endsWith('!'), name.includes('z'))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include "ccjs\/string\.h"/)
  assert.match(result.code, /ccjs_string_includes_parts\(name->bytes, name->len, "d", 1\)/)
  assert.match(result.code, /ccjs_string_starts_with_parts\(name->bytes, name->len, "A", 1\)/)
  assert.match(result.code, /ccjs_string_ends_with_parts\(name->bytes, name->len, "a", 1\)/)
  assert.match(result.code, /ccjs_string_includes_parts\("Ada", 3, "d", 1\)/)
  assert.match(result.code, /ccjs_string_ends_with_parts\(message->bytes, message->len, "!", 1\)/)
})

test('lowers C string slice for literals and runtime strings', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function middle(name: string): string {
  return name.slice(1, 3)
}

function getName(): string {
  return 'Grace'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + '!'
  console.log('Ada'.slice(1, 3), middle(name), user.name.slice(0, 1), getName().slice(1, 4), message.slice(3), name.slice(0, 99), name.slice(-2))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /size_t ccjs_slice_length_\d+ = ccjs_string_code_point_length_parts\(name->bytes, name->len\);/
  )
  assert.match(result.code, /double ccjs_slice_start_raw_\d+ = 1;/)
  assert.match(result.code, /double ccjs_slice_start_raw_\d+ = \(-2\);/)
  assert.match(
    result.code,
    /if \(ccjs_slice_end_\d+ < ccjs_slice_start_\d+\) ccjs_slice_end_\d+ = ccjs_slice_start_\d+;/
  )
  assert.match(
    result.code,
    /ccjs_string_slice_parts\(&ccjs_default_allocator, name->bytes, name->len, ccjs_slice_start_\d+, ccjs_slice_end_\d+, &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_slice_parts\(&ccjs_default_allocator, "Ada", 3, ccjs_slice_start_\d+, ccjs_slice_end_\d+, &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_slice_parts\(&ccjs_default_allocator, ccjs_slice_string_\d+->bytes, ccjs_slice_string_\d+->len, ccjs_slice_start_\d+, ccjs_slice_end_\d+, &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_slice_parts\(&ccjs_default_allocator, message->bytes, message->len, ccjs_slice_start_\d+, ccjs_slice_end_\d+, &ccjs_value_\d+\)/
  )
})

test('lowers C string split for literals and runtime strings', () => {
  const result = compileSource(
    `type User = {
  names: string
}

export function main(): void {
  const user: User = { names: 'Ada,Grace' }
  const names = user.names.split(',')
  const initials = user.names.split(',').map(name => name.slice(0, 1)).sort()
  console.log(names[0], names[1], initials[0], initials[1])
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.runtimeRequirements, ['collections', 'managed-values', 'objects', 'string-bytes'])
  assert.match(
    result.code,
    /ccjs_string_split_parts\(&ccjs_default_allocator, ccjs_split_string_\d+->bytes, ccjs_split_string_\d+->len, ",", 1, &ccjs_split_array_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_slice_parts\(&ccjs_default_allocator, name->bytes, name->len, ccjs_slice_start_\d+, ccjs_slice_end_\d+, &ccjs_value_\d+\)/
  )
})

test('lowers C string trim for literals and runtime strings', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function clean(name: string): string {
  return name.trim()
}

function getName(): string {
  return ' Grace '
}

export function main(): void {
  const user: User = { name: ' Ada ' }
  const name = user.name
  const message = ' ' + name + ' '
  console.log(' Ada '.trim(), clean(name), user.name.trim(), getName().trim(), message.trim())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /ccjs_string_trim_parts\(&ccjs_default_allocator, name->bytes, name->len, &ccjs_value_\d+\)/
  )
  assert.match(result.code, /ccjs_string_trim_parts\(&ccjs_default_allocator, " Ada ", 5, &ccjs_value_\d+\)/)
  assert.match(
    result.code,
    /ccjs_string_trim_parts\(&ccjs_default_allocator, ccjs_trim_string_\d+->bytes, ccjs_trim_string_\d+->len, &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_trim_parts\(&ccjs_default_allocator, message->bytes, message->len, &ccjs_value_\d+\)/
  )
})

test('lowers C String conversion for string number boolean and null values', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function label(value: number): string {
  return String(value)
}

function flag(value: boolean): string {
  return String(value)
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const local = 'Ada'
  console.log(String('Ada'), String(local), String(name), label(42), flag(true), String(false), String(null), String(name).length)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "Ada", 3, &ccjs_value_\d+\)/)
  assert.match(
    result.code,
    /ccjs_string_from_literal\(&ccjs_default_allocator, local, strlen\(local\), &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_from_literal\(&ccjs_default_allocator, name->bytes, name->len, &ccjs_value_\d+\)/
  )
  assert.match(result.code, /ccjs_string_from_number\(&ccjs_default_allocator, value, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_from_bool\(&ccjs_default_allocator, \(value\) != 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_from_bool\(&ccjs_default_allocator, \(0\) != 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "null", 4, &ccjs_value_\d+\)/)
})

test('lowers C Number conversion to nullable number parsing', () => {
  const result = compileSource(
    `export function main(): void {
  const port = Number('8080') ?? 3000
  const fallback = Number('nope') ?? 3000
  console.log(port, fallback)
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['number-from-string-null', 'runtime-values', 'string-bytes'])
  assert.match(result.code, /ccjs_string_to_number\("8080", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_string_to_number\("nope", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /if \(ccjs_value_\d+\.tag == CCJS_TAG_NULL\) \{/)
  assert.match(result.code, /ccjs_value_\d+\.tag != CCJS_TAG_NUMBER/)

  assertDiagnostic(
    `export function main(): void {
  const port = Number('8080')
  console.log(port)
}
`,
    'CCJS_C_NULLISH',
    {
      target: 'c'
    }
  )
})

test('lowers known C object field access to runtime calls', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { score: 42, active: true }
  const score = user.score
  const active = user.active
  console.log(score, active)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_field_\d+\)/)
  assert.match(result.code, /const double score = ccjs_field_\d+\.as\.number;/)
  assert.match(result.code, /ccjs_object_get_known\(user, 1, &ccjs_field_\d+\)/)
  assert.match(result.code, /const double active = ccjs_field_\d+\.as\.boolean \? 1 : 0;/)
})

test('lowers known C string object field access to runtime strings', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { name: 'Ada', score: 42 }
  const name = user.name
  console.log(name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_field_\d+\)/)
  assert.match(
    result.code,
    /if \(ccjs_field_\d+\.tag != CCJS_TAG_STRING \|\| ccjs_field_\d+\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /const ccjs_string \*name = \(ccjs_string \*\)ccjs_field_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)name->len, name->bytes\);/)
})

test('lowers known C object field assignments to runtime calls', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { score: 1, active: false, name: 'Ada' }
  user.score = 42
  user.active = true
  user.name = 'Grace'
  const score = user.score
  const active = user.active
  const name = user.name
  console.log(score, active, name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_set_known\(user, 0, ccjs_number_value\(42\)\)/)
  assert.match(result.code, /ccjs_object_set_known\(user, 1, ccjs_bool_value\(true\)\)/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "Grace", 5/)
  assert.match(result.code, /ccjs_object_set_known\(user, 2, ccjs_value_\d+\)/)
  assert.match(
    result.code,
    /printf\("%g %g %\.\*s\\n", \(\(double\)score\), \(\(double\)active\), \(int\)name->len, name->bytes\);/
  )
})

test('lowers C string index object field reads through runtime lookup', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { score: 42, active: true, name: 'Ada' }
  const score = user['score']
  const active = user['active']
  const name = user['name']
  console.log(score, active, name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get\(user, "score", 5, &ccjs_field_\d+\)/)
  assert.match(result.code, /const double score = ccjs_field_\d+\.as\.number;/)
  assert.match(result.code, /ccjs_object_get\(user, "active", 6, &ccjs_field_\d+\)/)
  assert.match(result.code, /const double active = ccjs_field_\d+\.as\.boolean \? 1 : 0;/)
  assert.match(result.code, /ccjs_object_get\(user, "name", 4, &ccjs_field_\d+\)/)
  assert.match(result.code, /const ccjs_string \*name = \(ccjs_string \*\)ccjs_field_\d+\.as\.ref;/)
  assert.match(
    result.code,
    /printf\("%g %g %\.\*s\\n", \(\(double\)score\), \(\(double\)active\), \(int\)name->len, name->bytes\);/
  )
})

test('lowers C string index object field assignments through runtime lookup', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { score: 1, active: false, name: 'Ada' }
  user['score'] = 42
  user['active'] = true
  user['name'] = 'Grace'
  const score = user['score']
  const active = user['active']
  const name = user['name']
  console.log(score, active, name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_set\(user, "score", 5, ccjs_number_value\(42\)\)/)
  assert.match(result.code, /ccjs_object_set\(user, "active", 6, ccjs_bool_value\(true\)\)/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "Grace", 5/)
  assert.match(result.code, /ccjs_object_set\(user, "name", 4, ccjs_value_\d+\)/)
  assert.match(
    result.code,
    /printf\("%g %g %\.\*s\\n", \(\(double\)score\), \(\(double\)active\), \(int\)name->len, name->bytes\);/
  )
})

test('lowers known C array index access to runtime calls', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [42, true]
  const score = values[0]
  const active = values[1]
  console.log(score, active)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_item_\d+\)/)
  assert.match(result.code, /const double score = ccjs_item_\d+\.as\.number;/)
  assert.match(result.code, /ccjs_array_get\(values, 1, &ccjs_item_\d+\)/)
  assert.match(result.code, /const double active = ccjs_item_\d+\.as\.boolean \? 1 : 0;/)
})

test('lowers known C array index assignments to runtime calls', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1, false]
  values[0] = 42
  values[1] = true
  const score = values[0]
  const active = values[1]
  console.log(score, active)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_number_value\(42\)\)/)
  assert.match(result.code, /ccjs_array_set\(values, 1, ccjs_bool_value\(true\)\)/)
  assert.match(result.code, /const double score = ccjs_item_\d+\.as\.number;/)
  assert.match(result.code, /const double active = ccjs_item_\d+\.as\.boolean \? 1 : 0;/)
})

test('lowers known C string array index reads to runtime strings', () => {
  const result = compileSource(
    `export function main(): void {
  const values = ['Ada']
  values[0] = 'Grace'
  const name = values[0]
  console.log(name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_item_\d+\)/)
  assert.match(
    result.code,
    /if \(ccjs_item_\d+\.tag != CCJS_TAG_STRING \|\| ccjs_item_\d+\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /const ccjs_string \*name = \(ccjs_string \*\)ccjs_item_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)name->len, name->bytes\);/)
})

test('propagates C runtime strings through local declarations', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { name: 'Ada' }
  const name = user.name
  const again = name
  console.log(again)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /const ccjs_string \*name = \(ccjs_string \*\)ccjs_field_\d+\.as\.ref;/)
  assert.match(result.code, /const ccjs_string \*again = name;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)again->len, again->bytes\);/)
})

test('lowers C runtime string references for object and array assignments', () => {
  const result = compileSource(
    `export function main(): void {
  const source = { name: 'Ada' }
  const name = source.name
  const target = { name: 'Bob' }
  const values = ['Grace']
  target.name = name
  values[0] = name
  const objectName = target.name
  const arrayName = values[0]
  console.log(objectName, arrayName)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /ccjs_value ccjs_value_\d+;\n {2}ccjs_value_\d+\.tag = CCJS_TAG_STRING;\n {2}ccjs_value_\d+\.as\.ref = \(ccjs_ref \*\)&name->header;/
  )
  assert.match(result.code, /ccjs_object_set_known\(target, 0, ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_value_\d+\)/)
  assert.match(
    result.code,
    /printf\("%\.\*s %\.\*s\\n", \(int\)objectName->len, objectName->bytes, \(int\)arrayName->len, arrayName->bytes\);/
  )
})

test('lowers C string-returning calls for object and array assignments', () => {
  const result = compileSource(
    `function getName(): string {
  return 'Ada'
}

export function main(): void {
  const target = { name: 'Bob' }
  const values = ['Grace']
  target.name = getName()
  values[0] = getName()
  console.log(target.name, values[0])
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_value_\d+ = getName\(\);/)
  assert.match(result.code, /ccjs_object_set_known\(target, 0, ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_set\(values, 0, ccjs_value_\d+\)/)
  assert.match(result.code, /printf\("%\.\*s %\.\*s\\n"/)
})

test('lowers C runtime string parameters', () => {
  const result = compileSource(
    `function greet(name: string): void {
  console.log(name)
}

function echo(name: string): string {
  return name
}

export function main(): void {
  const user = { name: 'Ada' }
  greet('Ada')
  greet(user.name)
  console.log(echo(user.name))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /void greet\(ccjs_value ccjs_param_name\);/)
  assert.match(result.code, /ccjs_value echo\(ccjs_value ccjs_param_name\);/)
  assert.match(
    result.code,
    /if \(ccjs_param_name\.tag != CCJS_TAG_STRING \|\| ccjs_param_name\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /ccjs_string \*name = \(ccjs_string \*\)ccjs_param_name\.as\.ref;/)
  assert.match(result.code, /greet\(ccjs_value_\d+\);/)
  assert.match(result.code, /echo\(ccjs_value_\d+\)/)
})

test('prepares C string arguments for number-returning calls inside expressions', () => {
  const result = compileSource(
    `function length(name: string): number {
  return 3
}

export function main(): void {
  const user = { name: 'Ada' }
  const total = length('Ada') + length(user.name)
  console.log(length(user.name), total)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /double length\(ccjs_value ccjs_param_name\);/)
  assert.match(result.code, /ccjs_string_from_literal\(&ccjs_default_allocator, "Ada", 3, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /const double total = \(length\(ccjs_value_\d+\) \+ length\(ccjs_value_\d+\)\);/)
  assert.match(result.code, /printf\("%g %g\\n", \(\(double\)length\(ccjs_value_\d+\)\), \(\(double\)total\)\);/)
})

test('lowers C string-returning functions to owned runtime values', () => {
  const result = compileSource(
    `function getName(): string {
  return 'Ada'
}

export function main(): void {
  const name = getName()
  console.log(name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_value getName\(void\);/)
  assert.match(result.code, /ccjs_value getName\(void\) \{\n {2}ccjs_value ccjs_return = ccjs_undefined_value\(\);/)
  assert.match(
    result.code,
    /ccjs_return = ccjs_value_\d+;\n {2}if \(ccjs_return\.tag != CCJS_TAG_STRING \|\| ccjs_return\.as\.ref == 0\)\s+goto ccjs_cleanup;\n {2}ccjs_retain\(ccjs_return\);\n {2}goto ccjs_cleanup;/
  )
  assert.match(result.code, /return ccjs_return;/)
  assert.match(
    result.code,
    /ccjs_value ccjs_value_\d+ = ccjs_undefined_value\(\);\n {2}ccjs_release\(ccjs_value_\d+\);\n {2}ccjs_value_\d+ = ccjs_undefined_value\(\);\n {2}ccjs_value_\d+ = getName\(\);/
  )
  assert.match(result.code, /const ccjs_string \*name = \(ccjs_string \*\)ccjs_value_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)name->len, name->bytes\);/)
})

test('lowers C runtime string field returns', () => {
  const result = compileSource(
    `function getName(): string {
  const user = { name: 'Ada' }
  return user.name
}

export function main(): void {
  const name = getName()
  console.log(name)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_return = ccjs_value_\d+;/)
  assert.match(result.code, /return ccjs_return;/)
})

test('lowers C runtime string index returns', () => {
  const result = compileSource(
    `function getObjectName(): string {
  const user = { name: 'Ada' }
  return user['name']
}

function getArrayName(): string {
  const values = ['Grace']
  return values[0]
}

export function main(): void {
  console.log(getObjectName(), getArrayName())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get\(user, "name", 4, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_value getObjectName\(void\);/)
  assert.match(result.code, /ccjs_value getArrayName\(void\);/)
  assert.match(result.code, /printf\("%\.\*s %\.\*s\\n"/)
})

test('lowers direct C console.log for string-returning calls', () => {
  const result = compileSource(
    `function getName(): string {
  return 'Ada'
}

export function main(): void {
  console.log(getName())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_value ccjs_value_\d+ = ccjs_undefined_value\(\);/)
  assert.match(result.code, /ccjs_value_\d+ = getName\(\);/)
  assert.match(result.code, /ccjs_string \*ccjs_log_string_\d+ = \(ccjs_string \*\)ccjs_value_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)ccjs_log_string_\d+->len, ccjs_log_string_\d+->bytes\);/)
})

test('lowers C runtime string concatenation', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function getName(): string {
  return 'Grace'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const message = name + ' ' + getName() + '!'
  console.log(message)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /ccjs_string_concat_parts\(&ccjs_default_allocator, name->bytes, name->len, " ", 1, &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_concat_parts\(&ccjs_default_allocator, ccjs_cmp_string_\d+->bytes, ccjs_cmp_string_\d+->len, ccjs_cmp_string_\d+->bytes, ccjs_cmp_string_\d+->len, &ccjs_value_\d+\)/
  )
  assert.match(
    result.code,
    /ccjs_string_concat_parts\(&ccjs_default_allocator, ccjs_cmp_string_\d+->bytes, ccjs_cmp_string_\d+->len, "!", 1, &ccjs_value_\d+\)/
  )
  assert.match(result.code, /const ccjs_string \*message = \(ccjs_string \*\)ccjs_value_\d+\.as\.ref;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)message->len, message->bytes\);/)
})

test('rejects unsupported C non-equality string binary expressions with a stable diagnostic', () => {
  assertDiagnostic(
    `function getName(): string {
  return 'Ada'
}

export function main(): void {
  const same = getName() < 'Ada'
  console.log(same)
}
`,
    'CCJS_C_STRING_EXPR',
    {
      target: 'c'
    }
  )
})

test('lowers C string equality comparisons by content', () => {
  const result = compileSource(
    `type User = {
  name: string
}

function getName(): string {
  return 'Ada'
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const values = ['Ada', 'Grace']
  const name = 'Ada'
  const sameLocal = name === 'Ada'
  const sameRuntime = user.name === values[0]
  const differentCall = getName() !== values[1]
  console.log(sameLocal, sameRuntime, differentCall)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include <string\.h>/)
  assert.match(result.code, /const char \*name = "Ada";/)
  assert.match(
    result.code,
    /const double sameLocal = \(strlen\(name\) == 3 && memcmp\(name, "Ada", strlen\(name\)\) == 0\);/
  )
  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_value_\d+\)/)
  assert.match(
    result.code,
    /const double sameRuntime = \(ccjs_cmp_string_\d+->len == ccjs_cmp_string_\d+->len && memcmp\(ccjs_cmp_string_\d+->bytes, ccjs_cmp_string_\d+->bytes, ccjs_cmp_string_\d+->len\) == 0\);/
  )
  assert.match(
    result.code,
    /const double differentCall = \(!\(ccjs_cmp_string_\d+->len == ccjs_cmp_string_\d+->len && memcmp\(ccjs_cmp_string_\d+->bytes, ccjs_cmp_string_\d+->bytes, ccjs_cmp_string_\d+->len\) == 0\)\);/
  )
})

test('lowers direct C console.log member and index expressions', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { score: 42, active: true, name: 'Ada' }
  const values = [7, false, 'Grace']
  console.log(user.score, user.active, user.name, user['name'], values[0], values[1], values[2])
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(user, 2, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get\(user, "name", 4, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 2, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /\(\(double\)\(ccjs_log_value_\d+\.as\.boolean \? 1 : 0\)\)/)
  assert.match(result.code, /printf\("%g %g %\.\*s %\.\*s %g %g %\.\*s\\n"/)
})

test('lowers known C member and index reads inside scalar expressions', () => {
  const result = compileSource(
    `export function main(): void {
  const user = { score: 7, active: true }
  const values = [3, true]
  const total = user.score + values[0]
  const same = user.active === values[1]
  console.log(total, same)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_expr_value_\d+\)/)
  assert.match(result.code, /ccjs_array_get\(values, 0, &ccjs_expr_value_\d+\)/)
  assert.match(
    result.code,
    /const double total = \(ccjs_expr_value_\d+\.as\.number \+ ccjs_expr_value_\d+\.as\.number\);/
  )
  assert.match(
    result.code,
    /const double same = \(\(ccjs_expr_value_\d+\.as\.boolean \? 1 : 0\) == \(ccjs_expr_value_\d+\.as\.boolean \? 1 : 0\)\);/
  )
})

test('compiles if else blocks to JS and C', () => {
  const source = `export function main(): void {
  let text = 'no'

  if (1 < 2) {
    text = 'yes'
  } else {
    text = 'never'
  }

  console.log(text)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /if \(\(1 < 2\)\) \{/)
  assert.match(js.code, /} else \{/)
  assert.match(c.code, /if \(1 < 2\) \{/)
  assert.match(c.code, /text = "yes";/)
})

test('compiles while loops to JS and C', () => {
  const source = `export function main(): void {
  let index = 0
  let total = 0

  while (index < 4) {
    total = total + index
    index = index + 1
  }

  console.log(total)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /while \(\(index < 4\)\) \{/)
  assert.match(c.code, /while \(index < 4\) \{/)
  assert.match(c.code, /total = \(total \+ index\);/)
})

test('prepares C string-argument calls in if while and switch conditions', () => {
  const result = compileSource(
    `function isReady(label: string): boolean {
  return true
}

function keepGoing(index: number, label: string): boolean {
  return index < 2
}

function choose(label: string): number {
  return 2
}

export function main(): void {
  let index = 0

  if (isReady('if')) {
    index = index + 1
  }

  while (keepGoing(index, 'while')) {
    index = index + 1
  }

  switch (choose('switch')) {
    case 2:
      index = index + 1
      break
    default:
      break
  }

  console.log(index)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /ccjs_string_from_literal\(&ccjs_default_allocator, "if", 2, &ccjs_value_\d+\) != CCJS_OK[\s\S]*if \(isReady\(ccjs_value_\d+\)\) \{/
  )
  assert.match(
    result.code,
    /while \(1\) \{\n\s+ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+if \(ccjs_string_from_literal\(&ccjs_default_allocator, "while", 5, &ccjs_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;\n\s+if \(!\(keepGoing\(index, ccjs_value_\d+\)\)\) break;/
  )
  assert.match(
    result.code,
    /ccjs_string_from_literal\(&ccjs_default_allocator, "switch", 6, &ccjs_value_\d+\) != CCJS_OK[\s\S]*switch \(\(int\)choose\(ccjs_value_\d+\)\) \{/
  )
})

test('prepares owned C runtime values before rewriting them inside loops', () => {
  const result = compileSource(
    `export function main(): void {
  let index = 0

  while (index < 2) {
    const user = { name: 'Ada' }
    console.log(user.name)
    index = index + 1
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /while \(index < 2\) \{[\s\S]*ccjs_release\(user\);\n {4}user = ccjs_undefined_value\(\);\n {4}if \(ccjs_object_new/
  )
  assert.match(
    result.code,
    /ccjs_release\(ccjs_value_\d+\);\n {4}ccjs_value_\d+ = ccjs_undefined_value\(\);\n {4}if \(ccjs_string_from_literal/
  )
  assert.match(
    result.code,
    /ccjs_release\(ccjs_log_value_\d+\);\n {4}ccjs_log_value_\d+ = ccjs_undefined_value\(\);\n {4}if \(ccjs_object_get_known/
  )
})

test('compiles classic for loops to JS and C', () => {
  const source = `export function main(): void {
  let total = 0

  for (let index = 0; index < 4; index = index + 1) {
    total = total + index
  }

  console.log(total)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /for \(let index = 0; \(index < 4\); index = \(index \+ 1\)\) \{/)
  assert.match(c.code, /for \(double index = 0; \(index < 4\); \(index = \(index \+ 1\)\)\) \{/)
})

test('compiles continue statements to JS and C', () => {
  const source = `export function main(): void {
  let total = 0

  for (let index = 0; index < 5; index = index + 1) {
    if (index === 2) {
      continue
    }

    total = total + index
  }

  console.log(total)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /continue/)
  assert.match(c.code, /goto ccjs_continue_\d+;/)
  assert.match(c.code, /ccjs_continue_\d+:\s*;/)
})

test('prepares C string-argument calls in classic for clauses', () => {
  const source = `function start(label: string): number {
  return 0
}

function keepGoing(index: number, label: string): boolean {
  return index < 3
}

function nextIndex(index: number, label: string): number {
  return index + 1
}

export function main(): void {
  let total = 0

  for (let index = start('start'); keepGoing(index, 'limit'); index = nextIndex(index, 'step')) {
    total = total + index
  }

  console.log(total)
}
`
  const result = compileSource(source, {
    target: 'c'
  })

  assert.match(
    result.code,
    /\{\n\s+ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+if \(ccjs_string_from_literal\(&ccjs_default_allocator, "start", 5, &ccjs_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;\n\s+double index = start\(ccjs_value_\d+\);/
  )
  assert.match(
    result.code,
    /for \(;;\) \{\n\s+ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+if \(ccjs_string_from_literal\(&ccjs_default_allocator, "limit", 5, &ccjs_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;\n\s+if \(!\(keepGoing\(index, ccjs_value_\d+\)\)\) break;/
  )
  assert.match(
    result.code,
    /ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+if \(ccjs_string_from_literal\(&ccjs_default_allocator, "step", 4, &ccjs_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;\n\s+\(index = nextIndex\(index, ccjs_value_\d+\)\);/
  )
})

test('lowers C string-returning for initializers into scoped loop blocks', () => {
  const result = compileSource(
    `function getName(): string {
  return 'Ada'
}

export function main(): void {
  let index = 0

  for (const name = getName(); index < 1; index = index + 1) {
    console.log(name)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /\{\n\s+ccjs_release\(ccjs_value_\d+\);\n\s+ccjs_value_\d+ = ccjs_undefined_value\(\);\n\s+ccjs_value_\d+ = getName\(\);/
  )
  assert.match(result.code, /const ccjs_string \*name = \(ccjs_string \*\)ccjs_value_\d+\.as\.ref;\n\s+for \(;;\) \{/)
  assert.match(result.code, /if \(!\(index < 1\)\) break;/)
  assert.doesNotMatch(
    result.code,
    /if \((ccjs_value_\d+)\.tag != CCJS_TAG_STRING \|\| \1\.as\.ref == 0\)\s+goto ccjs_cleanup;\n\s+if \(\1\.tag != CCJS_TAG_STRING \|\| \1\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
})

test('compiles for of loops over arrays to JS and C', () => {
  const source = `export function main(): void {
  const values = [1, 2, 3]
  let total = 0

  for (const value of values) {
    total = total + value
  }

  console.log(total)
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /for \(const value of values\) \{/)
  const jsNoMain = compileSource(source, {
    target: 'js',
    callMain: false
  })

  assert.match(jsNoMain.code, /for \(const value of values\) \{/)
  assert.doesNotThrow(() =>
    compileSource(jsNoMain.code, {
      target: 'js',
      callMain: false
    })
  )

  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /for \(size_t ccjs_for_index_\d+ = 0; ccjs_for_index_\d+ < 3; ccjs_for_index_\d+ \+= 1\) \{/)
  assert.match(c.code, /ccjs_array_get\(values, ccjs_for_index_\d+, &ccjs_for_value_\d+\)/)
  assert.match(c.code, /double value = ccjs_for_value_\d+\.as\.number;/)
})

test('checks explicit typed for of bindings in TypeScript source and JS output', () => {
  const source = `type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const users: User[] = [{ id: 1, name: 'Ada' }]

  for (const user: User of users) {
    console.log(user.name)
  }
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  const jsNoMain = compileSource(source, {
    target: 'js',
    callMain: false
  })

  assert.match(js.code, /for \(const user of users\) \{/)
  assert.match(jsNoMain.code, /for \(const user of users\) \{/)
  assert.doesNotThrow(() =>
    compileSource(jsNoMain.code, {
      target: 'js',
      callMain: false
    })
  )

  assertDiagnostic(
    `export function main(): void {
  const names = ['Ada']

  for (const value: number of names) {
    console.log(value)
  }
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('compiles for of loops over string arrays to C', () => {
  const c = compileSource(
    `export function main(): void {
  const names = ['Ada', 'Grace']

  for (const name of names) {
    console.log(name)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(c.code, /ccjs_array_get\(names, ccjs_for_index_\d+, &ccjs_for_value_\d+\)/)
  assert.match(
    c.code,
    /if \(ccjs_for_value_\d+\.tag != CCJS_TAG_STRING \|\| ccjs_for_value_\d+\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(c.code, /ccjs_string \*name = \(ccjs_string \*\)ccjs_for_value_\d+\.as\.ref;/)
  assert.match(c.code, /printf\("%\.\*s\\n", \(int\)name->len, name->bytes\);/)
})

test('compiles for of loops over Set values to JS and C', () => {
  const source = `type Bag = {
  names: Set<string>
}

export function main(): void {
  const values: Set<number> = new Set([1, 2, 3])
  const names: Set<string> = new Set(['Ada', 'Grace'])
  const bag: Bag = { names }
  let total = 0
  let letters = 0

  for (const value of values.add(4)) {
    total = total + value
  }

  for (const name of bag['names']) {
    letters = letters + name.length
  }

  console.log(total, letters)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /for \(const value of values\.add\(4\)\) \{/)
  assert.match(c.code, /ccjs_set_add\(values, ccjs_number_value\(4\)\)/)
  assert.match(c.code, /ccjs_set \*ccjs_for_set_\d+ = \(ccjs_set \*\)values\.as\.ref;/)
  assert.match(c.code, /CCJS_SET_SLOT_OCCUPIED/)
  assert.match(c.code, /ccjs_for_value_\d+ = ccjs_for_set_\d+->entries\[ccjs_for_set_index_\d+\]\.value;/)
  assert.match(c.code, /ccjs_object_get\(bag, "names", 5, &ccjs_value_\d+\)/)
  assert.match(c.code, /ccjs_string \*name = \(ccjs_string \*\)ccjs_for_value_\d+\.as\.ref;/)
})

test('compiles for of loops over Map values as MapEntry objects', () => {
  const source = `type Bag = {
  scores: Map<string, number>
}

export function main(): void {
  const scores: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])
  const bag: Bag = { scores }
  let total = 0
  let letters = 0

  for (const entry of bag['scores'].set('Alan', 5)) {
    total = total + entry.value
    letters = letters + entry.key.length
  }

  console.log(total, letters)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  const jsNoMain = compileSource(source, {
    target: 'js',
    callMain: false
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /for \(const ccjsMapEntry_entry of bag\["scores"\]\.set\("Alan", 5\)\) \{/)
  assert.match(js.code, /const entry = \{ key: ccjsMapEntry_entry\[0\], value: ccjsMapEntry_entry\[1\] \}/)
  assert.match(jsNoMain.code, /for \(const ccjsMapEntry_entry of bag\["scores"\]\.set\("Alan", 5\)\) \{/)
  assert.doesNotThrow(() =>
    compileSource(jsNoMain.code, {
      target: 'js',
      callMain: false
    })
  )
  assert.match(c.code, /ccjs_map \*ccjs_for_map_\d+ = \(ccjs_map \*\)ccjs_value_\d+\.as\.ref;/)
  assert.match(c.code, /CCJS_MAP_SLOT_OCCUPIED/)
  assert.match(c.code, /ccjs_object_new\(&ccjs_default_allocator, &ccjs_shape_map_entry_\d+, &entry\)/)
  assert.match(c.code, /ccjs_object_init_known\(entry, 0, ccjs_for_map_\d+->entries\[ccjs_for_map_index_\d+\]\.key\)/)
  assert.match(c.code, /ccjs_object_init_known\(entry, 1, ccjs_for_map_\d+->entries\[ccjs_for_map_index_\d+\]\.value\)/)
  assert.match(c.code, /ccjs_object_get_known\(entry, 1, &ccjs_(?:expr_)?value_\d+\)/)
  assert.match(c.code, /ccjs_object_get_known\(entry, 0, &ccjs_(?:expr_)?value_\d+\)/)
})

test('rejects unsupported C for of iterables with a stable diagnostic', () => {
  assertDiagnostic(
    `export function main(): void {
  const user = { name: 'Ada' }
  for (const value of user) {
    console.log(value)
  }
}
`,
    'CCJS_C_FOR_OF',
    {
      target: 'c'
    }
  )
})

test('compiles for of loops over inline array literals to C', () => {
  const c = compileSource(
    `export function main(): void {
  let total = 0

  for (const value of [1, 2, 3]) {
    total = total + value
  }

  console.log(total)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(c.code, /ccjs_array_new\(&ccjs_default_allocator, 3, &ccjs_for_array_\d+\)/)
  assert.match(c.code, /for \(size_t ccjs_for_index_\d+ = 0; ccjs_for_index_\d+ < 3; ccjs_for_index_\d+ \+= 1\) \{/)
  assert.match(c.code, /double value = ccjs_for_value_\d+\.as\.number;/)
})

test('compiles for of loops over inline string array literals to C', () => {
  const c = compileSource(
    `export function main(): void {
  for (const name of ['Ada', 'Grace']) {
    console.log(name)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(c.code, /ccjs_array_new\(&ccjs_default_allocator, 2, &ccjs_for_array_\d+\)/)
  assert.match(c.code, /ccjs_string \*name = \(ccjs_string \*\)ccjs_for_value_\d+\.as\.ref;/)
  assert.match(c.code, /printf\("%\.\*s\\n", \(int\)name->len, name->bytes\);/)
})

test('compiles switch statements to JS and C', () => {
  const source = `export function main(): void {
  const code = 2
  let text = 'none'

  switch (code) {
    case 1:
      text = 'one'
      break
    case 2:
      text = 'two'
      break
    default:
      text = 'other'
  }

  console.log(text)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /switch \(code\) \{/)
  assert.match(js.code, /case 2:/)
  assert.match(js.code, /break/)
  assert.match(c.code, /switch \(\(int\)code\) \{/)
  assert.match(c.code, /case \(int\)2: \{/)
  assert.match(c.code, /goto ccjs_break_\d+;/)
  assert.match(c.code, /ccjs_break_\d+:\s*;/)
})

test('rejects dynamic C switch case labels with a stable diagnostic', () => {
  const source = `function choose(label: string): number {
  return 1
}

export function main(): void {
  const code = 1

  switch (code) {
    case choose('one'):
      console.log('one')
      break
    default:
      console.log('other')
  }
}
`

  assertDiagnostic(source, 'CCJS_C_SWITCH_CASE', {
    target: 'c'
  })
})

test('rejects var with a stable diagnostic code', () => {
  assert.throws(
    () => {
      compileSource('var value = 1', {
        target: 'js'
      })
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(error.diagnostics[0].code, 'CCJS_NO_VAR')
      return true
    }
  )
})

test('allows assignment to let bindings', () => {
  const result = compileSource(
    `export function main(): void {
  let count = 1
  count = 2
  console.log(count)
}
`,
    {
      target: 'js'
    }
  )

  assert.match(result.code, /let count = 1/)
  assert.match(result.code, /count = 2/)
})

test('prepares C string-argument calls in scalar assignment statements', () => {
  const result = compileSource(
    `function nextIndex(index: number, label: string): number {
  return index + 1
}

export function main(): void {
  let index = 0
  index = nextIndex(index, 'step')
  console.log(index)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /ccjs_release\(ccjs_value_\d+\);\n {2}ccjs_value_\d+ = ccjs_undefined_value\(\);\n {2}if \(ccjs_string_from_literal\(&ccjs_default_allocator, "step", 4, &ccjs_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;\n {2}index = nextIndex\(index, ccjs_value_\d+\);/
  )
})

test('returns checked HIR and target-neutral IR with simple value types', () => {
  const result = compileSource(
    `export function main(): void {
  const name = 'Ada'
  const count = 1
  console.log(name, count)
}
`,
    {
      target: 'js'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration')
  assert.ok(main)
  const [name, count] = main.body.filter((item) => item.type === 'VariableDeclaration')

  assert.equal(result.hir.type, 'HirProgram')
  assert.equal(name.valueType, 'string')
  assert.equal(count.valueType, 'number')
  assert.equal(result.ir.type, 'IrProgram')
  assert.equal(result.ir.version, 1)
  assert.deepEqual(result.ir.runtimeRequirements, [])
  assert.deepEqual(result.ir.topLevelItems, [
    {
      kind: 'function',
      index: 0,
      loc: {
        line: 1,
        column: 17
      }
    }
  ])
  assert.deepEqual(result.ir.functionDeclarations, [
    {
      name: 'main',
      exported: true,
      async: false,
      params: [],
      returnType: 'void',
      returnNullable: false,
      loc: {
        line: 1,
        column: 17
      }
    }
  ])
  assert.deepEqual(result.ir.syntaxFeatures, [])
  assert.deepEqual(result.ir.globalUsages, [])
  assert.deepEqual(result.ir.functionEffects, [
    {
      name: 'main',
      throws: false,
      throwValueTypes: []
    }
  ])
  assert.deepEqual(result.ir.body, result.hir.body)
})

test('drives JS main wrappers from function declarations and C main wrappers from top-level statements', () => {
  const functionSource = `export function main(): void {
  console.log('hello')
}
`
  const topLevelC = compileSource("console.log('hello')\n", {
    target: 'c'
  })
  const js = compileSource(functionSource, {
    target: 'js'
  })
  const c = compileSource(functionSource, {
    target: 'c'
  })
  const withoutMainDeclaration = {
    ...js.ir,
    functionDeclarations: []
  }

  assert.match(js.code, /const ccjsMainResult = main\(\)/)
  assert.doesNotMatch(emitJsFromIr(withoutMainDeclaration), /const ccjsMainResult = main\(\)/)
  assert.match(c.code, /void ccjs_main\(void\) \{/)
  assert.doesNotMatch(c.code, /int main\(void\) \{[\s\S]*ccjs_main\(\);/)
  assert.match(topLevelC.code, /int main\(void\) \{[\s\S]*printf\("%s\\n", "hello"\);/)
  assert.doesNotMatch(
    emitCFromIr({
      ...c.ir,
      functionDeclarations: []
    }),
    /int main\(void\) \{\n {2}ccjs_main\(\);/
  )
})

test('drives C async task wrapper selection from target-neutral IR function declarations', () => {
  const result = compileSource(
    `async function getValue(): Promise<number> {
  const value = await Promise.resolve(2)
  return value
}

export async function main(): Promise<void> {
  const value = await getValue()
  console.log(value)
}
`,
    {
      target: 'c'
    }
  )
  const ir = {
    ...result.ir,
    body: result.ir.body.map((item) =>
      item.type === 'FunctionDeclaration' && item.name === 'getValue'
        ? {
            ...item,
            async: false,
            returnPromiseValueType: null
          }
        : item
    )
  }
  const entries = collectIrFunctionNodeEntries([ir])
  const getValue = entries.find((item) => item.declaration.name === 'getValue')
  const code = emitCFromIr(ir)

  assert.equal(getValue?.declaration.async, true)
  assert.equal(getValue?.node.async, false)
  assert.match(code, /ccjs_async_task_getValue_frame/)
  assert.match(code, /ccjs_async_task_getValue_start/)
})

test('drives JS and C top-level emission from target-neutral IR top-level items', () => {
  const source = `const name = 'Ada'
console.log(name)
`
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })
  const withoutTopLevelItems = {
    ...js.ir,
    topLevelItems: []
  }

  assert.deepEqual(
    js.ir.topLevelItems.map((item) => item.kind),
    ['statement', 'statement']
  )
  assert.match(js.code, /const name = "Ada"/)
  assert.match(js.code, /console\.log\(name\)/)
  assert.doesNotMatch(emitJsFromIr(withoutTopLevelItems), /const name/)
  assert.doesNotMatch(emitJsFromIr(withoutTopLevelItems), /console\.log/)
  assert.doesNotMatch(
    emitJsFromIr({
      ...js.ir,
      body: []
    }),
    /const name/
  )
  assert.match(c.code, /printf\("%s\\n", name\);/)
  assert.doesNotMatch(
    emitCFromIr({
      ...c.ir,
      topLevelItems: []
    }),
    /printf/
  )
  assert.doesNotMatch(
    emitCFromIr({
      ...c.ir,
      body: []
    }),
    /printf/
  )
})

test('collects IR top-level node entries from stored metadata', () => {
  const result = compileSource(
    `type User = {
  name: string
}

export function greet(): void {
  console.log('hi')
}

const count = 1
`,
    {
      target: 'js'
    }
  )
  const entries = collectIrTopLevelNodeEntries(result.ir)

  assert.deepEqual(
    entries.map((entry) => `${entry.kind}:${entry.node.type}`),
    ['type:TypeAliasDeclaration', 'function:FunctionDeclaration', 'statement:VariableDeclaration']
  )
  assert.deepEqual(
    collectIrTopLevelNodeEntries({
      ...result.ir,
      body: []
    }),
    []
  )
  assert.deepEqual(
    collectIrTopLevelNodeEntries({
      ...result.ir,
      topLevelItems: []
    }),
    []
  )
})

test('tracks type aliases as target-neutral IR top-level type items', () => {
  const source = `type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1, name: 'Ada' }
  console.log(user.name)
}
`
  const plainJs = compileSource(source, {
    target: 'js',
    callMain: false
  })
  const withoutTypeItems = {
    ...plainJs.ir,
    topLevelItems: plainJs.ir.topLevelItems.filter((item) => item.kind !== 'type')
  }

  assert.deepEqual(
    plainJs.ir.topLevelItems.map((item) => item.kind),
    ['type', 'function']
  )
  assert.doesNotMatch(plainJs.code, /type User = \{/)
  assert.match(plainJs.code, /export function main\(\) \{/)
  assert.match(
    emitJsFromIr(withoutTypeItems, {
      callMain: false
    }),
    /export function main\(\) \{/
  )
})

test('drives C function collection from target-neutral IR body', () => {
  const result = compileSource(
    `function greet(): void {
  console.log('hello')
}

export function main(): void {
  greet()
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /void greet\(void\) \{/)
  assert.match(result.code, /void ccjs_main\(void\) \{/)

  const withoutIrBodyFunctions = emitCFromIr({
    ...result.ir,
    body: []
  })

  assert.doesNotMatch(withoutIrBodyFunctions, /void greet\(void\) \{/)
  assert.doesNotMatch(withoutIrBodyFunctions, /void ccjs_main\(void\) \{/)
})

test('collects IR top-level function nodes across stored programs', () => {
  const left = compileSource(
    `export function left(): void {
  console.log('left')
}
`,
    {
      target: 'js'
    }
  )
  const right = compileSource(
    `export function right(): void {
  console.log('right')
}
`,
    {
      target: 'js'
    }
  )
  const functions = collectIrTopLevelNodesFromPrograms([left.ir, right.ir], 'function')

  assert.deepEqual(
    functions.map((item) => (item.type === 'FunctionDeclaration' ? item.name : null)),
    ['left', 'right']
  )
  assert.deepEqual(
    collectIrTopLevelNodesFromPrograms(
      [
        {
          ...left.ir,
          topLevelItems: []
        },
        {
          ...right.ir,
          body: []
        }
      ],
      'function'
    ),
    []
  )
})

test('emits single-file JS and C directly from target-neutral IR programs', () => {
  const result = compileSource(
    `export function main(): void {
  console.log('hello')
}
`,
    {
      target: 'js'
    }
  )

  assert.match(emitJsFromIr(result.ir), /const ccjsMainResult = main\(\)/)
  assert.match(emitCFromIr(result.ir), /void ccjs_main\(void\) \{/)
})

test('collects target-neutral IR feature requirements', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1, 2, 3]
  const names = ['Ada', 'Grace']
  const initials = names.map(name => name.slice(0, 1))
  const now = Date.now()
  console.log(values.length, initials[0], now, 'Ada' === names[0])
}
`,
    {
      target: 'c'
    }
  )

  assert.equal(result.ir.type, 'IrProgram')
  assert.deepEqual(result.ir.features, ['clocks', 'collections', 'runtime-values', 'string-bytes'])
  assert.deepEqual(result.ir.runtimeRequirements, ['clocks', 'collections', 'managed-values', 'string-bytes'])
  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.root),
    ['Date']
  )
  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['Date.now']
  )
  assert.match(result.code, /#include "ccjs\/time\.h"/)
})

test('drives JS helper prelude from stored target-neutral IR features', () => {
  const result = compileSource(
    `export function main(): void {
  const values = [1]
  const value = values.pop()
  const headers: Map<string, string> = new Map()
  headers['content-type'] = 'application/json'
  const contentType = headers['content-type']

  console.log(value ?? 0, contentType ?? 'missing')
}
`,
    {
      target: 'js'
    }
  )
  const storedFeaturesOnly = {
    ...result.ir,
    body: [],
    topLevelItems: []
  }
  const withoutFeatures = {
    ...result.ir,
    body: [],
    features: [],
    topLevelItems: []
  }
  const js = emitJsFromIr(storedFeaturesOnly, {
    callMain: false
  })

  assert.deepEqual(collectIrFeatureRequirements([storedFeaturesOnly]), [
    'array-pop-null',
    'collections',
    'map-get-null',
    'map-index-set',
    'runtime-values'
  ])
  assert.match(js, /function ccjsArrayPop\(array\) \{/)
  assert.match(js, /function ccjsMapGet\(map, key\) \{/)
  assert.match(js, /function ccjsMapSet\(map, key, value\) \{/)
  assert.doesNotMatch(
    emitJsFromIr(withoutFeatures, {
      callMain: false
    }),
    /function ccjs(?:ArrayPop|MapGet|MapSet)/
  )
})

test('drives IR function effect collection from top-level item metadata', () => {
  const result = compileSource(
    `function fail(): void {
  throw 'nope'
}

const label = 'ok'
console.log(label)
`,
    {
      target: 'js'
    }
  )

  assert.deepEqual(result.ir.functionEffects, [
    {
      name: 'fail',
      throws: true,
      throwValueTypes: ['string']
    }
  ])
  assert.deepEqual(
    collectIrFunctionEffects([
      {
        body: result.ir.body,
        topLevelItems: []
      }
    ]),
    []
  )
})

test('drives C throwing function ABI from stored target-neutral IR function effects', () => {
  const result = compileSource(
    `function ok(): void {
  console.log('ok')
}

export function main(): void {
  try {
    ok()
  } catch (error) {
    console.log(error)
  }
}
`,
    {
      target: 'c'
    }
  )
  const withThrowingEffect = {
    ...result.ir,
    functionEffects: result.ir.functionEffects.map((item) =>
      item.name === 'ok'
        ? {
            ...item,
            throws: true,
            throwValueTypes: ['string' as const]
          }
        : item
    )
  }
  const code = emitCFromIr(withThrowingEffect)

  assert.deepEqual(
    result.ir.functionEffects.find((item) => item.name === 'ok'),
    {
      name: 'ok',
      throws: false,
      throwValueTypes: []
    }
  )
  assert.match(code, /ccjs_status ok\(ccjs_value \*ccjs_error_out\);/)
  assert.match(code, /ccjs_status ok\(ccjs_value \*ccjs_error_out\) \{/)
  assert.match(code, /ccjs_status ccjs_call_status_\d+ = ok\(&ccjs_error\);/)
})

test('collects local IR throw value types for catch binding analysis', () => {
  const result = compileSource(
    `function failString(): void {
  throw 'nope'
}

function failError(): void {
  throw new Error('boom')
}

export function main(): void {
  const error = new Error('local')
  try {
    failString()
    failError()
    throw error
  } catch (caught) {
    console.log('caught')
  }
}
`,
    {
      target: 'js'
    }
  )
  const main = result.ir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const tryStatement = main?.body.find((item) => item.type === 'TryStatement')
  const functionThrowValueTypes = new Map(result.ir.functionEffects.map((item) => [item.name, item.throwValueTypes]))

  assert.deepEqual(
    collectIrLocalThrowValueTypes(tryStatement?.block, {
      errorObjectNames: ['error'],
      functionThrowValueTypes
    }),
    ['string', 'error']
  )
})

test('drives C runtime prelude from target-neutral IR requirements', () => {
  const result = compileSource(
    `export function main(): void {
  const values = ['Ada']
  const now = Date.now()
  console.log(values[0], now, 'Ada' === values[0])
}
`,
    {
      target: 'c'
    }
  )

  const code = emitCFromIr({
    ...result.ir,
    features: []
  })
  const withoutRuntimeRequirements = emitCFromIr({
    ...result.ir,
    runtimeRequirements: []
  })

  assert.deepEqual(result.ir.runtimeRequirements, ['clocks', 'collections', 'managed-values', 'string-bytes'])
  assert.match(code, /#include <string\.h>/)
  assert.match(code, /#include "ccjs\/array\.h"/)
  assert.match(code, /#include "ccjs\/time\.h"/)
  assert.doesNotMatch(withoutRuntimeRequirements, /#include <string\.h>/)
  assert.doesNotMatch(withoutRuntimeRequirements, /#include "ccjs\/array\.h"/)
  assert.doesNotMatch(withoutRuntimeRequirements, /#include "ccjs\/time\.h"/)
})

test('drives C async runtime headers from target-neutral IR requirements', () => {
  const result = compileSource(
    `export function main(): void {
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )
  const code = emitCFromIr({
    ...result.ir,
    runtimeRequirements: ['async-runtime']
  })
  const withoutAsyncRuntime = emitCFromIr({
    ...result.ir,
    runtimeRequirements: []
  })

  assert.match(code, /#include "ccjs\/loop\.h"/)
  assert.match(code, /#include "ccjs\/promise\.h"/)
  assert.match(code, /#include "ccjs\/time\.h"/)
  assert.match(code, /static ccjs_allocator ccjs_default_allocator = \{/)
  assert.doesNotMatch(withoutAsyncRuntime, /#include "ccjs\/loop\.h"/)
  assert.doesNotMatch(withoutAsyncRuntime, /#include "ccjs\/promise\.h"/)
  assert.doesNotMatch(withoutAsyncRuntime, /#include "ccjs\/time\.h"/)
})

test('drives C collection headers from target-neutral IR requirements', () => {
  const stringOnly = compileSource(
    `export function main(): void {
  const text = String(7)
  console.log(text.length)
}
`,
    {
      target: 'c'
    }
  )
  const arrayResult = compileSource(
    `export function main(): void {
  const values = [1]
  console.log(values.length)
}
`,
    {
      target: 'c'
    }
  )
  const arrayCode = emitCFromIr({
    ...arrayResult.ir,
    features: []
  })
  const withoutCollections = emitCFromIr({
    ...arrayResult.ir,
    runtimeRequirements: arrayResult.ir.runtimeRequirements.filter((item) => item !== 'collections')
  })

  assert.deepEqual(stringOnly.ir.runtimeRequirements, ['managed-values', 'string-bytes'])
  assert.doesNotMatch(stringOnly.code, /#include "ccjs\/array\.h"/)
  assert.doesNotMatch(stringOnly.code, /#include "ccjs\/map\.h"/)
  assert.doesNotMatch(stringOnly.code, /#include "ccjs\/object\.h"/)
  assert.doesNotMatch(stringOnly.code, /#include "ccjs\/set\.h"/)
  assert.deepEqual(arrayResult.ir.runtimeRequirements, ['collections', 'managed-values', 'string-bytes'])
  assert.match(arrayCode, /#include "ccjs\/array\.h"/)
  assert.match(arrayCode, /#include "ccjs\/map\.h"/)
  assert.match(arrayCode, /#include "ccjs\/set\.h"/)
  assert.doesNotMatch(withoutCollections, /#include "ccjs\/array\.h"/)
  assert.doesNotMatch(withoutCollections, /#include "ccjs\/map\.h"/)
  assert.doesNotMatch(withoutCollections, /#include "ccjs\/set\.h"/)
})

test('drives C object headers from target-neutral IR requirements', () => {
  const objectResult = compileSource(
    `type User = {
  name: string
}

export function main(): void {
  const user: User = { name: 'Ada' }
  console.log(user.name)
}
`,
    {
      target: 'c'
    }
  )
  const mapEntryResult = compileSource(
    `export function main(): void {
  const scores: Map<string, number> = new Map([['Ada', 7]])

  for (const entry of scores) {
    console.log(entry.key, entry.value)
  }
}
`,
    {
      target: 'c'
    }
  )
  const withoutObjects = emitCFromIr({
    ...objectResult.ir,
    runtimeRequirements: objectResult.ir.runtimeRequirements.filter((item) => item !== 'objects')
  })

  assert.deepEqual(objectResult.ir.runtimeRequirements, ['managed-values', 'objects'])
  assert.match(objectResult.code, /#include "ccjs\/object\.h"/)
  assert.doesNotMatch(withoutObjects, /#include "ccjs\/object\.h"/)
  assert.deepEqual(mapEntryResult.ir.runtimeRequirements, ['collections', 'managed-values', 'objects'])
  assert.match(mapEntryResult.code, /ccjs_object_new\(&ccjs_default_allocator, &ccjs_shape_map_entry_\d+, &entry\)/)
})

test('drives C JSON runtime from target-neutral IR requirements', () => {
  const result = compileSource(
    `type User = {
  name: string,
  score: number
}

export function main(): void {
  const user: User = JSON.parse('{"score":7,"name":"Ada"}')
  const text = JSON.stringify(user)
  console.log(user.name, user.score, text)
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.runtimeRequirements, ['collections', 'json', 'managed-values', 'objects', 'string-bytes'])
  assert.match(result.code, /#include "ccjs\/json\.h"/)
  assert.match(
    result.code,
    /ccjs_json_parse\(&ccjs_default_allocator, "\{\\"score\\":7,\\"name\\":\\"Ada\\"\}", 24, &ccjs_json_object_\d+\)/
  )
  assert.match(result.code, /ccjs_object_get\(ccjs_json_object_\d+, "name", 4, &ccjs_json_name_\d+\)/)
  assert.match(result.code, /ccjs_json_stringify\(&ccjs_default_allocator, user, &ccjs_json_value_\d+\)/)
})

test('lowers C JSON scalar parse through runtime tag checks', () => {
  const result = compileSource(
    `export function main(): void {
  const score: number = JSON.parse('7')
  const active: boolean = JSON.parse('true')
  console.log(score + 1, active)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_json_parse\(&ccjs_default_allocator, "7", 1, &ccjs_json_value_\d+\)/)
  assert.match(result.code, /ccjs_json_value_\d+\.tag != CCJS_TAG_NUMBER/)
  assert.match(result.code, /const double score = ccjs_json_value_\d+\.as\.number;/)
  assert.match(result.code, /ccjs_json_parse\(&ccjs_default_allocator, "true", 4, &ccjs_json_value_\d+\)/)
  assert.match(result.code, /ccjs_json_value_\d+\.tag != CCJS_TAG_BOOL/)
  assert.match(result.code, /const double active = \(ccjs_json_value_\d+\.as\.boolean \? 1 : 0\);/)
})

test('accepts supported C syntax features from stored target-neutral IR syntax features', () => {
  const result = compileSource(
    `export function main(): void {
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )

  assert.doesNotThrow(() =>
    emitCFromIr({
      ...result.ir,
      syntaxFeatures: [
        {
          feature: 'class' as const,
          loc: {
            line: 1,
            column: 1
          }
        }
      ]
    })
  )
})

test('keeps function signatures in HIR and compiles typed calls', () => {
  const result = compileSource(
    `function add(left: number, right: number): number {
  return left + right
}

export function main(): void {
  const total: number = add(2, 3)
  console.log(total)
}
`,
    {
      target: 'js'
    }
  )
  const add = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'add')
  assert.ok(add)

  assert.equal(add.returnType, 'number')
  assert.deepEqual(
    add.params.map((param) => param.valueType),
    ['number', 'number']
  )
  assert.match(result.code, /function add\(left, right\)/)
})

test('drives C function signature metadata from target-neutral IR declarations', () => {
  const result = compileSource(
    `function greet(value: string): void {
  console.log(value)
}

export function main(): void {
  greet('Ada')
}
`,
    {
      target: 'c'
    }
  )
  const greet = result.ir.functionDeclarations.find((item) => item.name === 'greet')

  assert.deepEqual(
    greet?.params.map((param) => ({
      name: param.name,
      valueType: param.valueType
    })),
    [
      {
        name: 'value',
        valueType: 'string'
      }
    ]
  )
  assert.equal(greet?.returnType, 'void')
  assert.match(result.code, /void greet\(ccjs_value ccjs_param_value\);/)
  assert.match(
    result.code,
    /void greet\(ccjs_value ccjs_param_value\) \{\n {2}if \(ccjs_param_value\.tag != CCJS_TAG_STRING \|\| ccjs_param_value\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /greet\(ccjs_value_\d+\);/)

  const withoutParamMetadata = emitCFromIr({
    ...result.ir,
    functionDeclarations: result.ir.functionDeclarations.map((item) =>
      item.name === 'greet'
        ? {
            ...item,
            params: []
          }
        : item
    )
  })

  assert.match(withoutParamMetadata, /void greet\(void\);/)
  assert.doesNotMatch(withoutParamMetadata, /ccjs_param_value/)
  assert.match(withoutParamMetadata, /greet\("Ada"\);/)
})

test('drives C function return ABI from target-neutral IR declarations', () => {
  const result = compileSource(
    `function getScore(): number {
  return 7
}

export function main(): void {
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /double getScore\(void\) \{/)
  assert.match(result.code, /ccjs_return = 7;/)

  const withNullableReturnMetadata = emitCFromIr({
    ...result.ir,
    functionDeclarations: result.ir.functionDeclarations.map((item) =>
      item.name === 'getScore'
        ? {
            ...item,
            returnNullable: true
          }
        : item
    )
  })

  assert.match(withNullableReturnMetadata, /ccjs_value getScore\(void\) \{/)
  assert.match(withNullableReturnMetadata, /ccjs_return = ccjs_number_value\(7\);/)
})

test('compiles named callback function values to JS and C', () => {
  const source = `function run(callback: Function): void {
  callback()
}

function hello(): void {
  console.log('callback')
}

export function main(): void {
  const callback: Function = hello
  run(callback)
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /const callback = hello/)
  assert.match(js.code, /run\(callback\)/)
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(void \(\*callback\)\(void\)\);/)
  assert.match(c.code, /void run\(void \(\*callback\)\(void\)\) \{\n {2}callback\(\);/)
  assert.match(c.code, /void \(\*const callback\)\(void\) = hello;/)
  assert.match(c.code, /run\(callback\);/)
})

test('compiles typed no-argument callback aliases to JS and C', () => {
  const source = `type Done = () => void;

function run(callback: Done): void {
  callback()
}

function hello(): void {
  console.log('typed')
}

export function main(): void {
  const callback: Done = hello
  run(callback)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(js.code, /const callback = hello/)
  assert.match(c.code, /void run\(void \(\*callback\)\(void\)\);/)
  assert.match(c.code, /void \(\*const callback\)\(void\) = hello;/)
})

test('compiles typed callback aliases with number parameters to C', () => {
  const source = `type NumberCallback = (value: number) => void;

function run(callback: NumberCallback): void {
  callback(7)
}

function hello(value: number): void {
  console.log(value)
}

export function main(): void {
  const callback: NumberCallback = hello
  run(callback)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(void \(\*callback\)\(double\)\);/)
  assert.match(c.code, /void run\(void \(\*callback\)\(double\)\) \{\n {2}callback\(7\);/)
  assert.match(c.code, /void \(\*const callback\)\(double\) = hello;/)
})

test('compiles typed callback aliases with string parameters through the C callback ABI', () => {
  const source = `type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('typed')
}

function hello(value: string): void {
  console.log(value)
}

export function main(): void {
  const callback: StringCallback = hello
  run(callback)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(ccjs_value callback\);/)
  assert.match(
    c.code,
    /static ccjs_status ccjs_callback_hello_0\(void \*context, const ccjs_value \*args, size_t arg_count, ccjs_value \*out\);/
  )
  assert.match(
    c.code,
    /if \(ccjs_callback_new\(&ccjs_default_allocator, ccjs_callback_hello_0, 0, 0, &callback\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(c.code, /ccjs_value ccjs_callback_args_\d+\[\] = \{ ccjs_value_\d+ \};/)
  assert.match(
    c.code,
    /if \(ccjs_callback_call\(callback, ccjs_callback_args_\d+, 1, &ccjs_callback_out_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
})

test('drives C callback wrapper collection from target-neutral IR top-level items', () => {
  const source = `type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('typed')
}

function hello(value: string): void {
  console.log(value)
}

export function main(): void {
  const callback: StringCallback = hello
  run(callback)
}
`
  const result = compileSource(source, {
    target: 'c'
  })

  assert.match(
    result.code,
    /static ccjs_status ccjs_callback_hello_0\(void \*context, const ccjs_value \*args, size_t arg_count, ccjs_value \*out\);/
  )
  const mainIndex = result.ir.body.findIndex((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const withoutMainBodyCallbacks = emitCFromIr({
    ...result.ir,
    body: result.ir.body.map((item, index) =>
      index === mainIndex
        ? {
            ...item,
            body: []
          }
        : item
    )
  })

  assert.doesNotMatch(withoutMainBodyCallbacks, /ccjs_callback_hello_0/)
  assert.doesNotMatch(
    emitCFromIr({
      ...result.ir,
      body: []
    }),
    /ccjs_callback_hello_0/
  )
})

test('compiles typed callback aliases with object parameters through the C callback ABI', () => {
  const source = `type Person = {
  name: string
};

type PersonCallback = (value: Person) => void;

function run(callback: PersonCallback, person: Person): void {
  callback(person)
}

function hello(value: Person): void {
  console.log(value.name)
}

export function main(): void {
  const person: Person = {
    name: 'Ada'
  }
  const callback: PersonCallback = hello
  run(callback, person)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(ccjs_value callback, ccjs_value person\);/)
  assert.match(c.code, /if \(args\[0\]\.tag != CCJS_TAG_OBJECT \|\| args\[0\]\.as\.ref == 0\) return CCJS_ERR_TYPE;/)
  assert.match(c.code, /ccjs_value ccjs_callback_args_\d+\[\] = \{ person \};/)
  assert.match(c.code, /if \(ccjs_object_get_known\(value, 0, &ccjs_log_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/)
})

test('compiles capturing runtime callback arrows to C callback context', () => {
  const source = `type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('Ada')
}

export function main(): void {
  const prefix = 'hello'
  const callback: StringCallback = (value: string) => {
    console.log(prefix, value)
  }
  run(callback)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(
    c.code,
    /typedef struct ccjs_callback_context_\d+ \{\n {2}const char \*prefix;\n\} ccjs_callback_context_\d+;/
  )
  assert.match(c.code, /static void ccjs_callback_context_\d+_finalize\(void \*context\);/)
  assert.match(
    c.code,
    /static ccjs_status ccjs_callback_arrow_\d+\(void \*context, const ccjs_value \*args, size_t arg_count, ccjs_value \*out\)/
  )
  assert.match(c.code, /ccjs_callback_context_\d+\* captured = \(ccjs_callback_context_\d+\*\)context;/)
  assert.match(c.code, /const char \*prefix = captured->prefix;/)
  assert.match(
    c.code,
    /ccjs_callback_context_\d+\* ccjs_callback_ctx_\d+ = ccjs_default_alloc\(0, sizeof\(ccjs_callback_context_\d+\), _Alignof\(ccjs_callback_context_\d+\)\);/
  )
  assert.match(c.code, /ccjs_callback_ctx_\d+->prefix = prefix;/)
  assert.match(
    c.code,
    /if \(ccjs_callback_new\(&ccjs_default_allocator, ccjs_callback_arrow_\d+, ccjs_callback_ctx_\d+, ccjs_callback_context_\d+_finalize, &callback\) != CCJS_OK\) \{/
  )
})

test('compiles runtime callback arrows with retained runtime captures', () => {
  const source = `type User = {
  name: string
}

type StringCallback = (value: string) => void;

function run(callback: StringCallback): void {
  callback('Grace')
}

export function main(): void {
  const user: User = { name: 'Ada' }
  const name = user.name
  const callback: StringCallback = (value: string) => {
    console.log(name, user.name, value)
  }
  run(callback)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(
    c.code,
    /typedef struct ccjs_callback_context_\d+ \{\n {2}ccjs_value name;\n {2}ccjs_value user;\n\} ccjs_callback_context_\d+;/
  )
  assert.match(
    c.code,
    /ccjs_callback_context_\d+\* captured = \(ccjs_callback_context_\d+\*\)context;\n {2}ccjs_release\(captured->name\);\n {2}ccjs_release\(captured->user\);/
  )
  assert.match(c.code, /ccjs_string \*name = \(ccjs_string \*\)captured->name\.as\.ref;/)
  assert.match(c.code, /ccjs_value user = captured->user;/)
  assert.match(
    c.code,
    /ccjs_callback_ctx_\d+->name\.tag = CCJS_TAG_STRING;\n {2}ccjs_callback_ctx_\d+->name\.as\.ref = \(ccjs_ref \*\)&name->header;\n {2}ccjs_retain\(ccjs_callback_ctx_\d+->name\);/
  )
  assert.match(c.code, /ccjs_callback_ctx_\d+->user = user;\n {2}ccjs_retain\(ccjs_callback_ctx_\d+->user\);/)
})

test('checks typed callback argument counts', () => {
  assertDiagnostic(
    `type NumberCallback = (value: number) => void;

function run(callback: NumberCallback): void {
  callback()
}
`,
    'CCJS_ARG_COUNT',
    {
      target: 'js'
    }
  )
})

test('compiles non-capturing inline C callback values to plain functions', () => {
  const source = `function run(callback: Function): void {
  callback()
}

export function main(): void {
  run(() => {
    console.log('inline')
  })
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /static void ccjs_callback_arrow_\d+\(void\);/)
  assert.match(c.code, /static void ccjs_callback_arrow_\d+\(void\) \{\n {2}printf\("%s\\n", "inline"\);/)
  assert.match(c.code, /run\(ccjs_callback_arrow_\d+\);/)
})

test('promotes capturing plain C callback values to runtime callbacks', () => {
  const source = `function run(callback: Function): void {
  callback()
}

export function main(): void {
  const label = 'captured'
  run(() => {
    console.log(label)
  })
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(ccjs_value callback\);/)
  assert.match(c.code, /if \(callback\.tag != CCJS_TAG_FUNCTION \|\| callback\.as\.ref == 0\)\s+goto ccjs_cleanup;/)
  assert.match(
    c.code,
    /typedef struct ccjs_callback_context_\d+ \{\n {2}const char \*label;\n\} ccjs_callback_context_\d+;/
  )
  assert.match(
    c.code,
    /static ccjs_status ccjs_callback_arrow_\d+\(void \*context, const ccjs_value \*args, size_t arg_count, ccjs_value \*out\)/
  )
  assert.match(
    c.code,
    /if \(ccjs_callback_call\(callback, 0, 0, &ccjs_callback_out_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    c.code,
    /if \(ccjs_callback_new\(&ccjs_default_allocator, ccjs_callback_arrow_\d+, ccjs_callback_ctx_\d+, ccjs_callback_context_\d+_finalize, &ccjs_callback_\d+\) != CCJS_OK\) \{/
  )
  assert.match(c.code, /run\(ccjs_callback_\d+\);/)
})

test('promotes capturing number callback values to runtime callbacks', () => {
  const source = `type NumberCallback = (value: number) => void;

function run(callback: NumberCallback): void {
  callback(7)
}

export function main(): void {
  const offset = 5
  run((value: number) => {
    console.log(value + offset)
  })
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(ccjs_value callback\);/)
  assert.match(c.code, /if \(callback\.tag != CCJS_TAG_FUNCTION \|\| callback\.as\.ref == 0\)\s+goto ccjs_cleanup;/)
  assert.match(c.code, /ccjs_value ccjs_callback_args_\d+\[\] = \{ ccjs_number_value\(7\) \};/)
  assert.match(
    c.code,
    /if \(ccjs_callback_call\(callback, ccjs_callback_args_\d+, 1, &ccjs_callback_out_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(c.code, /double value = args\[0\]\.as\.number;/)
  assert.match(c.code, /double offset = captured->offset;/)
})

test('promotes captured C callback variables to runtime callbacks', () => {
  const source = `type NumberCallback = (value: number) => void;

function run(callback: Function): void {
  callback()
}

function runNumber(callback: NumberCallback): void {
  callback(7)
}

export function main(): void {
  const label = 'captured'
  const offset = 5
  const callback: Function = () => {
    console.log(label)
  }
  const numberCallback: NumberCallback = (value: number) => {
    console.log(value + offset)
  }
  callback()
  run(callback)
  runNumber(numberCallback)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(ccjs_value callback\);/)
  assert.match(c.code, /void runNumber\(ccjs_value callback\);/)
  assert.match(c.code, /ccjs_value callback = ccjs_undefined_value\(\);/)
  assert.match(c.code, /ccjs_value numberCallback = ccjs_undefined_value\(\);/)
  assert.match(
    c.code,
    /if \(ccjs_callback_call\(callback, 0, 0, &ccjs_callback_out_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(c.code, /run\(callback\);/)
  assert.match(c.code, /runNumber\(numberCallback\);/)
})

test('rejects delayed callback storage in C with stable diagnostics', () => {
  assertDiagnostic(
    `type Task = () => void;
type Box = {
  task: Task
}

function hello(): void {
  console.log('hello')
}

export function main(): void {
  const box: Box = { task: hello }
  box.task()
}
`,
    'CCJS_C_FUNCTION_VALUE',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `type Task = () => void;

function hello(): void {
  console.log('hello')
}

export function main(): void {
  const tasks: Task[] = [hello]
  const task = tasks[0]
  task()
}
`,
    'CCJS_C_FUNCTION_VALUE',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `type Task = () => void;

function hello(): void {
  console.log('hello')
}

export function main(): void {
  const tasks: Map<string, Task> = new Map([['hello', hello]])
  const task: Task | null = tasks.get('hello')
  task?.()
}
`,
    'CCJS_C_FUNCTION_VALUE',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `type Task = () => void;

function makeTask(): Task {
  return () => {
    console.log('hello')
  }
}

export function main(): void {
  const task = makeTask()
  task()
}
`,
    'CCJS_C_FUNCTION_VALUE',
    {
      target: 'c'
    }
  )
})

test('boxes mutable numeric C callback captures', () => {
  const source = `function run(callback: Function): void {
  callback()
}

export function main(): void {
  let count = 0
  const callback: Function = () => {
    count = count + 1
    console.log(count)
  }
  run(callback)
  console.log(count)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /double \*count = 0;/)
  assert.match(c.code, /count = ccjs_default_alloc\(0, sizeof\(double\), _Alignof\(double\)\);/)
  assert.match(c.code, /\*count = 0;/)
  assert.match(c.code, /double \*count = captured->count;/)
  assert.match(c.code, /\(\*count\) = \(\(\*count\) \+ 1\);/)
  assert.match(c.code, /run\(callback\);/)
  assert.match(c.code, /printf\("%g\\n", \(\(double\)\(\*count\)\)\);/)
  assert.match(c.code, /if \(count != 0\) ccjs_default_free\(0, count, sizeof\(double\), _Alignof\(double\)\);/)
})

test('boxes mutable numeric C callback parameter captures', () => {
  const source = `function run(seed: number): void {
  const callback: Function = () => {
    seed = seed + 1
    console.log(seed)
  }
  callback()
  console.log(seed)
}

export function main(): void {
  run(1)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /void run\(double ccjs_param_seed\);/)
  assert.match(c.code, /double \*seed = 0;/)
  assert.match(c.code, /seed = ccjs_default_alloc\(0, sizeof\(double\), _Alignof\(double\)\);/)
  assert.match(c.code, /\*seed = ccjs_param_seed;/)
  assert.match(c.code, /double \*seed = captured->seed;/)
  assert.match(c.code, /\(\*seed\) = \(\(\*seed\) \+ 1\);/)
  assert.match(c.code, /if \(seed != 0\) ccjs_default_free\(0, seed, sizeof\(double\), _Alignof\(double\)\);/)
})

test('boxes mutable string and object C callback captures', () => {
  const source = `type Person = {
  name: string
}

function run(callback: Function): void {
  callback()
}

export function main(): void {
  let label = 'captured'
  let person: Person = { name: 'Ada' }
  const callback: Function = () => {
    label = label + '!'
    person.name = label
    console.log(label, person.name)
  }
  run(callback)
  console.log(label, person.name)
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(
    c.code,
    /typedef struct ccjs_callback_context_\d+ \{\n {2}ccjs_value \*label;\n {2}ccjs_value \*person;\n\} ccjs_callback_context_\d+;/
  )
  assert.match(c.code, /ccjs_value \*label = 0;/)
  assert.match(c.code, /ccjs_value \*person = 0;/)
  assert.match(c.code, /ccjs_value \*label = captured->label;/)
  assert.match(c.code, /ccjs_value \*person = captured->person;/)
  assert.match(c.code, /ccjs_value ccjs_box_value_\d+ = ccjs_value_\d+;/)
  assert.match(
    c.code,
    /ccjs_retain\(ccjs_box_value_\d+\);\n {2}ccjs_release\(\*label\);\n {2}\*label = ccjs_box_value_\d+;/
  )
  assert.match(c.code, /ccjs_object_set_known\(\(\*person\), 0, \(\*label\)\)/)
  assert.match(
    c.code,
    /if \(label != 0\) \{\n {4}ccjs_release\(\*label\);\n {4}ccjs_default_free\(0, label, sizeof\(ccjs_value\), _Alignof\(ccjs_value\)\);\n {2}\}/
  )
  assert.match(
    c.code,
    /if \(person != 0\) \{\n {4}ccjs_release\(\*person\);\n {4}ccjs_default_free\(0, person, sizeof\(ccjs_value\), _Alignof\(ccjs_value\)\);\n {2}\}/
  )
})

test('compiles simple optional object member and index access to C', () => {
  const source = `export function main(): void {
  const data = { name: 'Ada', score: 7 }
  const name = data?.name
  console.log(name, data?.['score'])
}
`
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /if \(ccjs_object_get_known\(data, 0, &ccjs_field_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/)
  assert.match(c.code, /const ccjs_string \*name = \(ccjs_string \*\)ccjs_field_\d+\.as\.ref;/)
  assert.match(c.code, /if \(ccjs_object_get\(data, "score", 5, &ccjs_log_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/)
})

test('compiles optional chaining to JS and rejects it for C', () => {
  const source = `function hello(): string {
  return 'called'
}

export function main(): void {
  const data = { items: [{ name: 'Ada' }], hello }
  const missing = null
  console.log(data?.items?.[0]?.name, missing?.items?.[0]?.name, data.hello?.())
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /data\?\.items\?\.\[0\]\?\.name/)
  assert.match(js.code, /data\.hello\?\.\(\)/)
  assertDiagnostic(source, 'CCJS_C_OPTIONAL_CHAINING', {
    target: 'c'
  })
})

test('lowers C optional access over nullable runtime values', () => {
  const result = compileSource(
    `type User = {
  name: string
}

export function main(): void {
  let user: User | null = null
  const names = ['Grace']
  const maybeNames: string[] | null = names
  console.log(user?.name ?? 'Ada', user?.['name'] ?? 'Ada', maybeNames?.[0] ?? 'Ada')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /if \(user\.tag == CCJS_TAG_NULL\) \{/)
  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_optional_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get\(user, "name", 4, &ccjs_optional_value_\d+\)/)
  assert.match(result.code, /if \(maybeNames\.tag == CCJS_TAG_NULL\) \{/)
  assert.match(result.code, /ccjs_array_get\(maybeNames, 0, &ccjs_optional_value_\d+\)/)
})

test('lowers C nullable string nullish coalescing', () => {
  const result = compileSource(
    `export function main(): void {
  const missing: string | null = null
  const present: string | null = 'Grace'
  console.log(missing ?? 'Ada', present ?? 'Ada', missing === null, present !== null)
}
`,
    {
      target: 'c'
    }
  )

  assert.equal(result.hir.body[0].body[0].nullable, true)
  assert.deepEqual(result.ir.features, ['runtime-values', 'string-bytes'])
  assert.match(result.code, /ccjs_null_value\(\)/)
  assert.match(result.code, /if \(missing\.tag == CCJS_TAG_NULL\) \{/)
  assert.match(result.code, /present\.tag == CCJS_TAG_NULL/)
})

test('lowers C nullable scalar nullish coalescing', () => {
  const result = compileSource(
    `type User = {
  score: number,
  active: boolean
}

export function main(): void {
  let score: number | null = null
  let active: boolean | null = null
  const values = [7]
  const maybeValues: number[] | null = values
  let user: User | null = { score: 9, active: true }
  console.log(score ?? 1, active ?? false, maybeValues?.[0] ?? 0, user?.score ?? 0, user?.active ?? false)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /score = ccjs_null_value\(\);/)
  assert.match(result.code, /ccjs_number_value\(9\)/)
  assert.match(result.code, /if \(score\.tag == CCJS_TAG_NULL\) \{/)
  assert.match(result.code, /score\.tag != CCJS_TAG_NUMBER/)
  assert.match(result.code, /active\.tag != CCJS_TAG_BOOL/)
  assert.match(result.code, /ccjs_array_get\(maybeValues, 0, &ccjs_optional_value_\d+\)/)

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = null
  console.log(score)
}
`,
    'CCJS_C_NULLISH',
    {
      target: 'c'
    }
  )
})

test('lowers C nullable scalar function params and returns', () => {
  const result = compileSource(
    `function maybeScore(seed: number): number | null {
  if (seed > 0) {
    return seed + 1
  }

  return null
}

function printScore(score: number | null, active: boolean | null): void {
  console.log(score ?? 0, active ?? false, score !== null, active === null)
}

export function main(): void {
  const first = maybeScore(1)
  const second: number | null = maybeScore(0)
  printScore(first, true)
  printScore(second, null)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_value maybeScore\(double seed\)/)
  assert.match(result.code, /void printScore\(ccjs_value ccjs_param_score, ccjs_value ccjs_param_active\)/)
  assert.match(result.code, /ccjs_value score = ccjs_param_score;/)
  assert.match(result.code, /ccjs_param_score\.tag != CCJS_TAG_NULL && ccjs_param_score\.tag != CCJS_TAG_NUMBER/)
  assert.match(result.code, /ccjs_return = ccjs_number_value\(\(seed \+ 1\)\);/)
  assert.match(result.code, /ccjs_return = ccjs_null_value\(\);/)
  assert.match(result.code, /ccjs_nullable_value_\d+ = maybeScore\(1\);/)
  assert.match(result.code, /printScore\(first, ccjs_bool_value\(\(1\) != 0\)\);/)

  assertDiagnostic(
    `function maybeScore(): number | null {
  return null
}

export function main(): void {
  console.log(maybeScore())
}
`,
    'CCJS_C_NULLISH',
    {
      target: 'c'
    }
  )
})

test('narrows C nullable scalar values inside null-checked branches', () => {
  const result = compileSource(
    `function printScore(score: number | null, active: boolean | null): void {
  if (score !== null) {
    console.log(score + 1)
  } else {
    console.log(0)
  }

  if (active === null) {
    console.log(false)
  } else {
    console.log(active)
  }
}

export function main(): void {
  printScore(4, true)
  printScore(null, null)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /if \(!\(score\.tag == CCJS_TAG_NULL\)\) \{/)
  assert.match(result.code, /\(score\.as\.number \+ 1\)/)
  assert.match(result.code, /if \(active\.tag == CCJS_TAG_NULL\) \{/)
  assert.match(result.code, /\(active\.as\.boolean \? 1 : 0\)/)

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = 1
  if (score !== null) {
    console.log(score)
  }
  console.log(score)
}
`,
    'CCJS_C_NULLISH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  let score: number | null = 1
  if (score !== null) {
    score = null
    console.log(score)
  }
}
`,
    'CCJS_C_NULLISH',
    {
      target: 'c'
    }
  )
})

test('narrows C nullable scalar values through logical conditions', () => {
  const result = compileSource(
    `function printScore(score: number | null, backup: number | null): void {
  if (score !== null && score > 2) {
    console.log(score + 1)
  }

  if (backup === null || backup < 1) {
    console.log(0)
  } else {
    console.log(backup + 2)
  }
}

export function main(): void {
  printScore(4, 3)
  printScore(null, null)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /score\.as\.number > 2/)
  assert.match(result.code, /\(score\.as\.number \+ 1\)/)
  assert.match(result.code, /backup\.as\.number < 1/)
  assert.match(result.code, /\(backup\.as\.number \+ 2\)/)

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = 1
  if (score !== null || score > 1) {
    console.log(1)
  }
}
`,
    'CCJS_C_NULLISH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = 1
  if (score === null && score > 1) {
    console.log(1)
  }
}
`,
    'CCJS_C_NULLISH',
    {
      target: 'c'
    }
  )
})

test('narrows C nullable scalar values after null-checked early returns', () => {
  const result = compileSource(
    `function printScore(score: number | null, active: boolean | null): void {
  if (score === null) {
    return
  }
  console.log(score + 1)

  if (active === null) {
    return
  }
  console.log(active)
}

function printHigh(score: number | null): void {
  if (score === null || score < 2) {
    return
  }
  console.log(score + 1)
}

export function main(): void {
  printScore(4, true)
  printHigh(3)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /\(score\.as\.number \+ 1\)/)
  assert.match(result.code, /\(active\.as\.boolean \? 1 : 0\)/)
  assert.match(result.code, /score\.as\.number < 2/)

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = 1
  if (score !== null) {
    return
  }
  console.log(score)
}
`,
    'CCJS_C_NULLISH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = 1
  if (score === null) {
    console.log(0)
  }
  console.log(score)
}
`,
    'CCJS_C_NULLISH',
    {
      target: 'c'
    }
  )
})

test('narrows C nullable scalar values inside loop bodies', () => {
  const result = compileSource(
    `function printLoop(score: number | null, active: boolean | null): void {
  while (score !== null && score > 0) {
    console.log(score + 1)
    score = null
  }

  for (let index = 0; active !== null && index < 1; index = index + 1) {
    console.log(active)
    active = null
  }
}

export function main(): void {
  printLoop(2, true)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /score\.as\.number > 0/)
  assert.match(result.code, /\(score\.as\.number \+ 1\)/)
  assert.match(result.code, /\(active\.as\.boolean \? 1 : 0\)/)

  assertDiagnostic(
    `export function main(): void {
  let score: number | null = 1
  while (score !== null) {
    score = null
    console.log(score)
  }
}
`,
    'CCJS_C_NULLISH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  const score: number | null = 1
  while (score === null) {
    console.log(score)
  }
}
`,
    'CCJS_C_NULLISH',
    {
      target: 'c'
    }
  )
})

test('lowers C optional calls over nullable callbacks', () => {
  const result = compileSource(
    `type Named = (name: string) => void;

function maybeLog(callback: Function | null): void {
  callback?.()
}

function maybeNamed(callback: Named | null): void {
  callback?.('Ada')
}

function hello(): void {
  console.log('hello')
}

function named(name: string): void {
  console.log(name)
}

export function main(): void {
  const callback: Function | null = hello
  callback?.()
  maybeLog(null)
  maybeLog(hello)

  let namedCallback: Named | null = null
  namedCallback?.('skip')
  namedCallback = named
  namedCallback?.('Grace')
  maybeNamed(named)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /void maybeLog\(ccjs_value callback\)/)
  assert.match(result.code, /void maybeNamed\(ccjs_value callback\)/)
  assert.match(result.code, /if \(callback\.tag != CCJS_TAG_NULL\) \{/)
  assert.match(result.code, /ccjs_callback_call\(callback, 0, 0, &ccjs_callback_out_\d+\)/)
  assert.match(result.code, /ccjs_callback_call\(namedCallback, ccjs_callback_args_\d+, 1, &ccjs_callback_out_\d+\)/)
  assert.match(result.code, /maybeLog\(ccjs_null_value\(\)\);/)
  assert.match(result.code, /namedCallback = ccjs_nullable_value_\d+;/)

  assertDiagnostic(
    `export function main(): void {
  const value = 1
  value?.()
}
`,
    'CCJS_C_OPTIONAL_CHAINING',
    {
      target: 'c'
    }
  )
})

test('lowers C optional call results over nullable scalar callbacks', () => {
  const result = compileSource(
    `type Score = (value: number) => number;
type Ready = () => boolean;

function addOne(value: number): number {
  return value + 1
}

function isReady(): boolean {
  return true
}

function printValues(score: Score | null, ready: Ready | null): void {
  const value: number | null = score?.(4)
  const flag: boolean | null = ready?.()
  console.log(value ?? 0, flag ?? false)
}

export function main(): void {
  printValues(addOne, isReady)
  printValues(null, null)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_callback_addOne_\d+\(void \*context, const ccjs_value \*args, size_t arg_count, ccjs_value \*out\)/
  )
  assert.match(result.code, /\*out = ccjs_number_value\(addOne\(args\[0\]\.as\.number\)\);/)
  assert.match(result.code, /\*out = ccjs_bool_value\(\(isReady\(\)\) != 0\);/)
  assert.match(result.code, /ccjs_optional_call_\d+ = ccjs_null_value\(\);/)
  assert.match(result.code, /ccjs_callback_call\(score, ccjs_callback_args_\d+, 1, &ccjs_optional_call_\d+\)/)
  assert.match(result.code, /ccjs_callback_call\(ready, 0, 0, &ccjs_optional_call_\d+\)/)
})

test('lowers C optional call results over nullable scalar arrow callbacks', () => {
  const result = compileSource(
    `type Score = (value: number) => number;
type Ready = () => boolean;

export function main(): void {
  const bonus = 3
  const score: Score | null = (value: number) => value + bonus
  const ready: Ready | null = () => bonus === 3
  const value: number | null = score?.(4)
  const flag: boolean | null = ready?.()
  console.log(value ?? 0, flag ?? false)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_callback_arrow_\d+\(void \*context, const ccjs_value \*args, size_t arg_count, ccjs_value \*out\)/
  )
  assert.match(result.code, /\*out = ccjs_number_value\(\(value \+ bonus\)\);/)
  assert.match(result.code, /\*out = ccjs_bool_value\(\(\(bonus == 3\)\) != 0\);/)
  assert.match(result.code, /ccjs_callback_call\(score, ccjs_callback_args_\d+, 1, &ccjs_optional_call_\d+\)/)
  assert.match(result.code, /ccjs_callback_call\(ready, 0, 0, &ccjs_optional_call_\d+\)/)
})

test('lowers C optional call results over nullable scalar block arrow callbacks', () => {
  const result = compileSource(
    `type Score = (value: number) => number;
type Ready = () => boolean;

export function main(): void {
  const bonus = 3
  const score: Score | null = (value: number) => {
    const doubled = value * 2
    if (doubled > 4) {
      return doubled + bonus
    }

    return bonus
  }
  const ready: Ready | null = () => {
    if (bonus === 3) {
      return true
    }

    return false
  }
  const value: number | null = score?.(4)
  const flag: boolean | null = ready?.()
  console.log(value ?? 0, flag ?? false)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_callback_arrow_\d+\(void \*context, const ccjs_value \*args, size_t arg_count, ccjs_value \*out\)/
  )
  assert.match(result.code, /\(\*out\) = ccjs_number_value\(\(doubled \+ bonus\)\);/)
  assert.match(result.code, /\(\*out\) = ccjs_bool_value\(\(1\) != 0\);/)
  assert.match(result.code, /goto ccjs_callback_cleanup;/)
  assert.match(result.code, /ccjs_callback_cleanup:/)
  assert.match(result.code, /ccjs_callback_call\(score, ccjs_callback_args_\d+, 1, &ccjs_optional_call_\d+\)/)
  assert.match(result.code, /ccjs_callback_call\(ready, 0, 0, &ccjs_optional_call_\d+\)/)
})

test('lowers C runtime callback returns through finally before callback cleanup', () => {
  const result = compileSource(
    `type Score = (value: number) => number;
type Name = () => string;

export function main(): void {
  const score: Score | null = (value: number) => {
    try {
      return value + 3
    } finally {
      console.log('score finally', value)
    }
  }

  const name: Name | null = () => {
    try {
      return 'Ada'
    } finally {
      console.log('name finally')
    }
  }

  const value: number | null = score?.(4)
  const text: string | null = name?.()
  console.log(value ?? 0, text ?? 'missing')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_callback_arrow_\d+\(void \*context, const ccjs_value \*args, size_t arg_count, ccjs_value \*out\) \{\n {2}\(void\)context;\n {2}if \(out == 0 \|\| arg_count != 1 \|\| args == 0\) return CCJS_ERR_TYPE;\n {2}\*out = ccjs_undefined_value\(\);\n {2}if \(args\[0\]\.tag != CCJS_TAG_NUMBER\) return CCJS_ERR_TYPE;\n {2}double value = args\[0\]\.as\.number;\n {2}int ccjs_return_active = 0;/
  )
  assert.match(
    result.code,
    /\(\*out\) = ccjs_number_value\(\(value \+ 3\)\);\n\s+ccjs_return_active = 1;\n\s+goto ccjs_try_\d+_finally;/
  )
  assert.match(
    result.code,
    /printf\("%s %g\\n", "score finally", .*value.*\);\n\s+if \(ccjs_error_active\) return CCJS_ERR_TYPE;\n\s+if \(ccjs_return_active\) goto ccjs_callback_cleanup;/
  )
  assert.match(
    result.code,
    /\(\*out\) = ccjs_value_\d+;\n\s+if \(\(\*out\)\.tag != CCJS_TAG_STRING \|\| \(\*out\)\.as\.ref == 0\) return CCJS_ERR_TYPE;\n\s+ccjs_retain\(\(\*out\)\);\n\s+ccjs_return_active = 1;\n\s+goto ccjs_try_\d+_finally;/
  )
  assert.match(
    result.code,
    /ccjs_callback_cleanup:\n {2}ccjs_release\(ccjs_value_\d+\);\n {2}ccjs_release\(ccjs_error\);\n {2}return CCJS_OK;/
  )
})

test('lowers C optional call results over nullable string callbacks', () => {
  const result = compileSource(
    `type Name = () => string;

function getName(): string {
  return 'Ada'
}

function printName(callback: Name | null): void {
  const value: string | null = callback?.()
  console.log(value ?? 'missing')
}

export function main(): void {
  printName(getName)
  printName(null)

  const arrow: Name | null = () => 'Grace'
  printName(arrow)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_callback_getName_\d+\(void \*context, const ccjs_value \*args, size_t arg_count, ccjs_value \*out\)/
  )
  assert.match(result.code, /\*out = getName\(\);/)
  assert.match(result.code, /\(\*out\) = ccjs_value_\d+;/)
  assert.match(result.code, /ccjs_retain\(\(\*out\)\);/)
  assert.match(result.code, /ccjs_callback_call\(callback, 0, 0, &ccjs_optional_call_\d+\)/)
  assert.match(result.code, /ccjs_optional_call_\d+\.tag != CCJS_TAG_STRING \|\| ccjs_optional_call_\d+\.as\.ref == 0/)
})

test('lowers C optional call results over nullable object callbacks', () => {
  const result = compileSource(
    `type User = {
  name: string,
  id: number
}
type MakeUser = () => User;

function getUser(): User {
  return { name: 'Ada', id: 7 }
}

function printUser(callback: MakeUser | null): void {
  const user: User | null = callback?.()
  const name: string | null = user?.name
  const id: number | null = user?.id
  console.log(name ?? 'missing', id ?? 0)
}

export function main(): void {
  printUser(getUser)
  printUser(null)

  const arrow: MakeUser | null = () => {
    return { name: 'Grace', id: 9 }
  }
  printUser(arrow)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_value getUser\(void\) \{/)
  assert.match(
    result.code,
    /static ccjs_status ccjs_callback_getUser_\d+\(void \*context, const ccjs_value \*args, size_t arg_count, ccjs_value \*out\)/
  )
  assert.match(result.code, /\*out = getUser\(\);/)
  assert.match(result.code, /\(\*out\) = ccjs_object_\d+;/)
  assert.match(result.code, /ccjs_callback_call\(callback, 0, 0, &ccjs_optional_call_\d+\)/)
  assert.match(result.code, /ccjs_optional_call_\d+\.tag != CCJS_TAG_OBJECT \|\| ccjs_optional_call_\d+\.as\.ref == 0/)
  assert.match(result.code, /ccjs_object_get_known\(user, 0, &ccjs_optional_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(user, 1, &ccjs_optional_value_\d+\)/)
})

test('compiles unsupported nullish coalescing to JS and rejects it for C', () => {
  const source = `function printValue(value: unknown): void {
  console.log(value ?? 'Ada')
}

export function main(): void {
  printValue(1)
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /console\.log\(\(value \?\? "Ada"\)\)/)
  assertDiagnostic(source, 'CCJS_C_NULLISH', {
    target: 'c'
  })
})

test('compiles throw and try catch finally to JS and lowers local string throws to C error channel', () => {
  const source = `export function main(): void {
  try {
    throw 'boom'
  } catch (error) {
    console.log(\`caught \${error}\`)
  } finally {
    console.log('finally')
  }
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /try \{/)
  assert.match(js.code, /throw "boom"/)
  assert.match(js.code, /\} catch \(error\) \{/)
  assert.match(js.code, /\} finally \{/)

  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /ccjs_value ccjs_error = ccjs_undefined_value\(\);/)
  assert.match(c.code, /int ccjs_error_active = 0;/)
  assert.match(c.code, /ccjs_retain\(ccjs_error\);\n {4}ccjs_error_active = 1;\n {4}goto ccjs_try_\d+_catch;/)
  assert.match(
    c.code,
    /ccjs_try_\d+_catch:\n {4}if \(ccjs_error\.tag != CCJS_TAG_STRING \|\| ccjs_error\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(c.code, /ccjs_string \*error = \(ccjs_string \*\)ccjs_error\.as\.ref;/)
  assert.match(c.code, /ccjs_release\(ccjs_error\);\n {4}ccjs_error = ccjs_undefined_value\(\);/)
  assert.match(c.code, /ccjs_try_\d+_finally:/)
  assert.match(c.code, /printf\("%s\\n", "finally"\);/)

  assertDiagnostic(
    `export function main(): void {
  throw 'boom'
}
`,
    'CCJS_C_THROW',
    {
      target: 'c'
    }
  )
})

test('lowers C number return through finally before cleanup', () => {
  const result = compileSource(
    `function getScore(): number {
  try {
    return 7
  } finally {
    console.log('finally')
  }
}

export function main(): void {
  console.log(getScore())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /double getScore\(void\) \{\n {2}double ccjs_return = 0;\n {2}int ccjs_return_active = 0;/)
  assert.match(result.code, /ccjs_return = 7;\n {4}ccjs_return_active = 1;\n {4}goto ccjs_try_\d+_finally;/)
  assert.match(
    result.code,
    /ccjs_try_\d+_finally:\n {4}printf\("%s\\n", "finally"\);\n {4}if \(ccjs_error_active\)\s+goto ccjs_cleanup;\n {4}if \(ccjs_return_active\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /ccjs_cleanup:\n {2}ccjs_release\(ccjs_error\);\n {2}return ccjs_return;/)
})

test('lowers C void return through finally before cleanup', () => {
  const result = compileSource(
    `function stop(): void {
  try {
    return
  } finally {
    console.log('finally')
  }
  console.log('after')
}

export function main(): void {
  stop()
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /void stop\(void\) \{\n {2}int ccjs_return_active = 0;/)
  assert.match(result.code, /ccjs_return_active = 1;\n {4}goto ccjs_try_\d+_finally;/)
  assert.match(
    result.code,
    /ccjs_try_\d+_finally:\n {4}printf\("%s\\n", "finally"\);\n {4}if \(ccjs_error_active\)\s+goto ccjs_cleanup;\n {4}if \(ccjs_return_active\)\s+goto ccjs_cleanup;/
  )
})

test('lowers C break and continue through finally before loop flow', () => {
  const result = compileSource(
    `export function main(): void {
  let index = 0
  while (index < 3) {
    index = index + 1
    try {
      if (index === 1) {
        continue
      }
      if (index === 2) {
        break
      }
    } finally {
      console.log(\`finally \${index}\`)
    }
    console.log(index)
  }
  console.log(index)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /int ccjs_break_active = 0;\n {2}int ccjs_continue_active = 0;/)
  assert.match(result.code, /ccjs_continue_active = 1;\n\s+goto ccjs_try_\d+_finally;/)
  assert.match(result.code, /ccjs_break_active = 1;\n\s+goto ccjs_try_\d+_finally;/)
  assert.match(result.code, /if \(ccjs_break_active\) goto ccjs_break_\d+;/)
  assert.match(result.code, /if \(ccjs_continue_active\) goto ccjs_continue_\d+;/)
  assert.match(result.code, /ccjs_break_\d+:\n\s+if \(ccjs_break_active\) ccjs_break_active = 0;/)
  assert.match(result.code, /ccjs_continue_\d+:\n\s+if \(ccjs_continue_active\) ccjs_continue_active = 0;/)
})

test('compiles Error objects to JS and lowers lightweight Error objects to C', () => {
  const source = `export function main(): void {
  const root = new Error('root', { code: 'E_ROOT' })
  const created = new Error('created', { code: 'E_CREATED', cause: root })
  console.log(created.name, created.message, created.code)
  try {
    const thrown = new Error('boom', { code: 'E_BOOM', cause: created })
    throw thrown
  } catch (error) {
    console.log(error.name, error.message, error.code)
  } finally {
    console.log('finally')
  }
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /const thrown = new Error\("boom", \{ code: "E_BOOM", cause: created \}\)/)
  assert.match(js.code, /throw thrown/)
  assert.match(js.code, /console\.log\(error\.name, error\.message, error\.code\)/)

  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(
    c.code,
    /static const ccjs_field_info ccjs_shape_error_\d+_fields\[\] = \{\n\s+\{ "name", CCJS_FIELD_READONLY \},\n\s+\{ "message", CCJS_FIELD_READONLY \},\n\s+\{ "code", CCJS_FIELD_READONLY \},\n\s+\{ "cause", CCJS_FIELD_READONLY \},/
  )
  assert.match(
    c.code,
    /if \(ccjs_object_new\(&ccjs_default_allocator, &ccjs_shape_error_\d+, &created\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(c.code, /ccjs_object_init_known\(created, 2, ccjs_value_\d+\)/)
  assert.match(c.code, /ccjs_object_init_known\(created, 3, root\)/)
  assert.match(
    c.code,
    /ccjs_error = thrown;\n {4}if \(ccjs_error\.tag != CCJS_TAG_OBJECT \|\| ccjs_error\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    c.code,
    /ccjs_try_\d+_catch:\n {4}if \(ccjs_error\.tag != CCJS_TAG_OBJECT \|\| ccjs_error\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(c.code, /ccjs_value error = ccjs_error;/)
  assert.match(c.code, /ccjs_object_get_known\(error, 0, &ccjs_log_value_\d+\)/)
  assert.match(c.code, /ccjs_object_get_known\(error, 1, &ccjs_log_value_\d+\)/)
  assert.match(c.code, /ccjs_object_get_known\(error, 2, &ccjs_log_value_\d+\)/)

  assertDiagnostic(
    `export function main(): void {
  try {
    throw { message: 'boom' }
  } catch (error) {
    console.log(error)
  }
}
`,
    'CCJS_C_THROW',
    {
      target: 'c'
    }
  )
  assertDiagnostic(
    `export function main(): void {
  const fake = {
    name: 'Error',
    message: 'boom'
  }
  try {
    throw fake
  } catch (error) {
    console.log(error)
  }
}
`,
    'CCJS_C_THROW',
    {
      target: 'c'
    }
  )
  assertDiagnostic(
    `export function main(): void {
  const error = new Error('boom', { cause: 'text' })
  console.log(error.message)
}
`,
    'CCJS_TYPE_MISMATCH',
    {
      target: 'c'
    }
  )
  assertDiagnostic(
    `export function main(): void {
  const error = new Error('boom')
  error.code = 'E_CHANGED'
}
`,
    'CCJS_ASSIGN_READONLY_FIELD',
    {
      target: 'c'
    }
  )
})

test('lowers C interfunction throws through status error ABI', () => {
  const source = `export function failString(): void {
  throw 'boom'
}

export function failError(): void {
  const error = new Error('bad')
  throw error
}

export function readValue(ok: boolean): number {
  if (ok) {
    return 7
  }

  throw 'no value'
}

export function main(): void {
  try {
    failString()
  } catch (error) {
    console.log(error)
  }

  try {
    failError()
  } catch (error) {
    console.log(error.name, error.message)
  }

  try {
    console.log(readValue(true))
    console.log(readValue(false))
  } catch (error) {
    console.log(error)
  }
}
`
  const result = compileSource(source, {
    target: 'c'
  })

  assert.deepEqual(result.ir.functionEffects, [
    {
      name: 'failString',
      throws: true,
      throwValueTypes: ['string']
    },
    {
      name: 'failError',
      throws: true,
      throwValueTypes: ['error']
    },
    {
      name: 'readValue',
      throws: true,
      throwValueTypes: ['string']
    },
    {
      name: 'main',
      throws: false,
      throwValueTypes: []
    }
  ])
  assert.match(result.code, /ccjs_status failString\(ccjs_value \*ccjs_error_out\);/)
  assert.match(result.code, /ccjs_status failError\(ccjs_value \*ccjs_error_out\);/)
  assert.match(result.code, /ccjs_status readValue\(double ok, double \*ccjs_out, ccjs_value \*ccjs_error_out\);/)
  assert.match(result.code, /ccjs_status_result = CCJS_ERR_THROW;\n {2}ccjs_error_active = 1;\n {2}goto ccjs_cleanup;/)
  assert.match(
    result.code,
    /if \(ccjs_error_active\) \{\n {4}\*ccjs_error_out = ccjs_error;\n {4}ccjs_error = ccjs_undefined_value\(\);\n {2}\}/
  )
  assert.match(
    result.code,
    /ccjs_status ccjs_call_status_\d+ = failString\(&ccjs_error\);\n {4}if \(ccjs_call_status_\d+ == CCJS_ERR_THROW\) \{\n {6}ccjs_error_active = 1;\n {6}goto ccjs_try_\d+_catch;/
  )
  assert.match(
    result.code,
    /ccjs_status ccjs_call_status_\d+ = failError\(&ccjs_error\);\n {4}if \(ccjs_call_status_\d+ == CCJS_ERR_THROW\) \{\n {6}ccjs_error_active = 1;\n {6}goto ccjs_try_\d+_catch;/
  )
  assert.match(
    result.code,
    /double ccjs_call_result_\d+ = 0;\n {4}ccjs_status ccjs_call_status_\d+ = readValue\(1, &ccjs_call_result_\d+, &ccjs_error\);/
  )
  assert.match(
    result.code,
    /ccjs_try_\d+_catch:\n {4}if \(ccjs_error\.tag != CCJS_TAG_OBJECT \|\| ccjs_error\.as\.ref == 0\)\s+goto ccjs_cleanup;\n {4}ccjs_error_active = 0;\n {4}\{\n {6}ccjs_value error = ccjs_error;/
  )
})

test('compiles simple classes to JS and C object runtime calls', () => {
  const source = `class User {
  readonly id: number
  name: string

  constructor(id: number, name: string) {
    this.id = id
    this.name = name
  }

  rename(next: string): void {
    this.name = next
  }

  score(extra: number): number {
    return this.id + extra
  }

  total(extra: number): number {
    return this.score(extra)
  }

  label(): string {
    return this.name
  }
}

export function main(): void {
  const user = new User(1, 'Ada')
  user.rename('Grace')
  const value = user.total(2)
  const name = user.label()
  console.log(value, name)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  assert.match(js.code, /class User \{/)
  assert.match(js.code, /\n {2}id\n {2}name\n/)
  assert.match(js.code, /constructor\(id, name\) \{/)
  assert.match(js.code, /this\.id = id/)
  assert.match(js.code, /this\.name = name/)
  assert.match(js.code, /rename\(next\) \{/)
  assert.match(js.code, /score\(extra\) \{/)
  assert.match(js.code, /total\(extra\) \{/)
  assert.match(js.code, /label\(\) \{/)
  assert.match(js.code, /const user = new User\(1, "Ada"\)/)
  assert.match(js.code, /const value = user\.total\(2\)/)
  assert.doesNotMatch(js.code, /readonly id: number/)
  assert.doesNotMatch(js.code, /rename\(next: string\)/)
  assert.deepEqual(
    js.ir.syntaxFeatures.map((item) => item.feature),
    ['class']
  )

  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /#include "ccjs\/object\.h"/)
  assert.match(
    c.code,
    /static const ccjs_field_info ccjs_shape_User_\d+_fields\[\] = \{\n\s+\{ "id", CCJS_FIELD_READONLY \},\n\s+\{ "name", 0 \},/
  )
  assert.match(c.code, /static void ccjs_method_User_rename\(ccjs_value this, ccjs_value ccjs_param_next\);/)
  assert.match(c.code, /static double ccjs_method_User_score\(ccjs_value this, double extra\);/)
  assert.match(c.code, /static double ccjs_method_User_total\(ccjs_value this, double extra\);/)
  assert.match(c.code, /static ccjs_value ccjs_method_User_label\(ccjs_value this\);/)
  assert.match(c.code, /ccjs_object_new\(&ccjs_default_allocator, &ccjs_shape_User_\d+, &user\)/)
  assert.match(c.code, /ccjs_object_init_known\(user, 0, ccjs_number_value\(1\)\)/)
  assert.match(c.code, /ccjs_object_init_known\(user, 1, ccjs_value_\d+\)/)
  assert.match(c.code, /ccjs_object_get_known\(this, 0, &ccjs_expr_value_\d+\)/)
  assert.match(c.code, /ccjs_method_User_rename\(user, ccjs_value_\d+\);/)
  assert.match(c.code, /const double value = ccjs_method_User_total\(user, 2\);/)
  assert.match(c.code, /ccjs_return = ccjs_method_User_score\(this, extra\);/)
  assert.match(c.code, /ccjs_method_value_\d+ = ccjs_method_User_label\(user\);/)
  assert.match(c.code, /ccjs_object_set_known\(this, 1, ccjs_value_\d+\)/)
})

test('rejects readonly class field assignment outside constructors', () => {
  assertDiagnostic(
    `class User {
  readonly id: number

  constructor(id: number) {
    this.id = id
  }

  rename(): void {
    this.id = 2
  }
}

export function main(): void {
  const user = new User(1)
  user.rename()
}
`,
    'CCJS_ASSIGN_READONLY_FIELD'
  )
})

test('rejects unsupported class inheritance with a stable diagnostic', () => {
  assertDiagnostic(
    `class User {
  id: number

  constructor(id: number) {
    this.id = id
  }
}

class Admin extends User {
  level: number

  constructor(id: number, level: number) {
    this.id = id
    this.level = level
  }
}
`,
    'CCJS_CLASS_EXTENDS'
  )
})

test('rejects unsupported static class members with stable diagnostics', () => {
  assertDiagnostic(
    `class User {
  static create(): User {
    return new User()
  }
}
`,
    'CCJS_CLASS_STATIC'
  )

  assertDiagnostic(
    `class Counter {
  static count: number
}
`,
    'CCJS_CLASS_STATIC'
  )
})

test('compiles awaited async function calls to JS and C', () => {
  const source = `async function getValue(): Promise<number> {
  return Promise.resolve(2)
}

async function getText(): Promise<string> {
  return Promise.resolve('ok')
}

export async function main(): Promise<void> {
  const text = await getText()
  const value = await getValue()
  console.log(text)
  console.log(value)
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /async function getValue\(\)/)
  assert.match(js.code, /async function getText\(\)/)
  assert.match(js.code, /return Promise\.resolve\(2\)/)
  assert.match(js.code, /export async function main\(\)/)
  assert.deepEqual(
    js.ir.syntaxFeatures.map((item) => item.feature),
    ['async-function', 'async-function', 'async-function']
  )
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /double getValue\(void\)/)
  assert.match(c.code, /ccjs_value getText\(void\)/)
  assert.match(c.code, /ccjs_return = ccjs_await_value_\d+\.as\.number;/)
  assert.match(c.code, /ccjs_return = ccjs_await_value_\d+;/)
  assert.match(c.code, /ccjs_await_value_\d+ = ccjs_number_value\(getValue\(\)\);/)
  assert.match(c.code, /ccjs_await_value_\d+ = getText\(\);/)
})

test('lowers async function calls as C Promise values', () => {
  const result = compileSource(
    `async function getValue(): Promise<number> {
  return Promise.resolve(3)
}

export async function main(): Promise<void> {
  const promise = getValue()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_promise \*promise = 0;/)
  assert.match(
    result.code,
    /if \(ccjs_promise_resolved\(&ccjs_loop, ccjs_number_value\(getValue\(\)\), &promise\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /while \(ccjs_promise_get_state\(promise\) == CCJS_PROMISE_PENDING && ccjs_loop_has_work\(&ccjs_loop\)\) \{/
  )
  const managed = compileSource(
    `async function getText(): Promise<string> {
  return Promise.resolve('ok')
}

export async function main(): Promise<void> {
  const promise = getText()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(managed.code, /ccjs_value ccjs_async_value_\d+ = ccjs_undefined_value\(\);/)
  assert.match(managed.code, /ccjs_async_value_\d+ = getText\(\);/)
  assert.match(
    managed.code,
    /if \(ccjs_async_value_\d+\.tag != CCJS_TAG_STRING \|\| ccjs_async_value_\d+\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    managed.code,
    /if \(ccjs_promise_resolved\(&ccjs_loop, ccjs_async_value_\d+, &promise\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    managed.code,
    /ccjs_release\(ccjs_async_value_\d+\);\n {2}ccjs_async_value_\d+ = ccjs_undefined_value\(\);/
  )

  const throwing = compileSource(
    `async function failText(): Promise<string> {
  throw 'fail'
}

export async function main(): Promise<void> {
  const promise = failText()

  try {
    await promise
  } catch (error) {
    console.log(error)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(throwing.code, /ccjs_status failText\(ccjs_value \*ccjs_out, ccjs_value \*ccjs_error_out\);/)
  assert.match(throwing.code, /ccjs_value ccjs_async_result_\d+ = ccjs_undefined_value\(\);/)
  assert.match(throwing.code, /ccjs_status ccjs_async_status_\d+ = failText\(&ccjs_async_result_\d+, &ccjs_error\);/)
  assert.match(
    throwing.code,
    /if \(ccjs_async_status_\d+ == CCJS_ERR_THROW\) \{\n {4}if \(ccjs_promise_rejected\(&ccjs_loop, ccjs_error, &promise\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(throwing.code, /ccjs_release\(ccjs_error\);\n {4}ccjs_error = ccjs_undefined_value\(\);/)
  assert.match(
    throwing.code,
    /if \(ccjs_async_result_\d+\.tag != CCJS_TAG_STRING \|\| ccjs_async_result_\d+\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    throwing.code,
    /if \(ccjs_promise_resolved\(&ccjs_loop, ccjs_async_result_\d+, &promise\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    throwing.code,
    /ccjs_release\(ccjs_async_result_\d+\);\n {4}ccjs_async_result_\d+ = ccjs_undefined_value\(\);/
  )
})

test('lowers simple async functions with await to C task frames', () => {
  const result = compileSource(
    `async function compute(): Promise<number> {
  const value = await Promise.resolve(2)

  return Promise.resolve(value + 3)
}

export async function main(): Promise<void> {
  const promise = compute()
  console.log(await compute())
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /typedef struct ccjs_async_task_compute_frame \{/)
  assert.match(result.code, /ccjs_promise \*awaited;/)
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_compute_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_compute_resume\(void \*context, ccjs_value ccjs_value_input\);/
  )
  assert.match(result.code, /status = ccjs_promise_new\(ccjs_loop, &frame->awaited\);/)
  assert.match(
    result.code,
    /status = ccjs_promise_then\(frame->awaited, ccjs_async_task_compute_resume, ccjs_async_task_compute_reject, frame, ccjs_async_task_compute_finalize\);/
  )
  assert.match(result.code, /status = ccjs_promise_resolve\(frame->awaited, ccjs_number_value\(2\)\);/)
  assert.match(result.code, /frame->local_value = ccjs_value_input\.as\.number;/)
  assert.match(result.code, /double value = frame->local_value;/)
  assert.match(result.code, /return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(\(value \+ 3\)\)\);/)
  assert.match(
    result.code,
    /if \(ccjs_async_task_compute_start\(&ccjs_loop, &promise\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_async_task_compute_start\(&ccjs_loop, &ccjs_promise_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.doesNotMatch(result.code, /ccjs_promise_resolved\(&ccjs_loop, ccjs_number_value\(compute\(\)\), &promise\)/)
  assert.doesNotMatch(result.code, /ccjs_await_value_\d+ = ccjs_number_value\(compute\(\)\);/)
})

test('lowers async task frame parameters to C frame fields', () => {
  const result = compileSource(
    `async function addLater(input: number, delta: number): Promise<number> {
  const value = await Promise.resolve(input)

  return Promise.resolve(value + delta)
}

export async function main(): Promise<void> {
  console.log(await addLater(2, 4))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /double param_input;/)
  assert.match(result.code, /double param_delta;/)
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_addLater_start\(ccjs_loop \*ccjs_loop, double ccjs_arg_input, double ccjs_arg_delta, ccjs_promise \*\* out\);/
  )
  assert.match(result.code, /double input = frame->param_input;/)
  assert.match(result.code, /double delta = frame->param_delta;/)
  assert.match(result.code, /frame->param_input = ccjs_arg_input;/)
  assert.match(result.code, /frame->param_delta = ccjs_arg_delta;/)
  assert.match(result.code, /status = ccjs_promise_resolve\(frame->awaited, ccjs_number_value\(input\)\);/)
  assert.match(result.code, /double input = frame->param_input;/)
  assert.match(result.code, /double delta = frame->param_delta;/)
  assert.match(result.code, /return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(\(value \+ delta\)\)\);/)
  assert.match(
    result.code,
    /if \(ccjs_async_task_addLater_start\(&ccjs_loop, 2, 4, &ccjs_promise_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.doesNotMatch(
    result.code,
    /ccjs_promise_resolved\(&ccjs_loop, ccjs_number_value\(addLater\(2, 4\)\), &ccjs_promise_\d+\)/
  )
})

test('lowers async task frame await over local Promise variables to C', () => {
  const result = compileSource(
    `async function addLater(input: number, delta: number): Promise<number> {
  const pending = Promise.resolve(input)
  const value = await pending

  return Promise.resolve(value + delta)
}

export async function main(): Promise<void> {
  console.log(await addLater(2, 4))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /status = ccjs_promise_resolved\(ccjs_loop, ccjs_number_value\(input\), &frame->awaited\);/)
  assert.match(
    result.code,
    /status = ccjs_promise_then\(frame->awaited, ccjs_async_task_addLater_resume, ccjs_async_task_addLater_reject, frame, ccjs_async_task_addLater_finalize\);/
  )
  assert.doesNotMatch(result.code, /status = ccjs_promise_new\(ccjs_loop, &frame->awaited\);/)
  assert.doesNotMatch(result.code, /status = ccjs_promise_resolve\(frame->awaited, ccjs_number_value\(input\)\);/)
  assert.match(result.code, /double input = frame->param_input;/)
  assert.match(result.code, /double delta = frame->param_delta;/)
  assert.match(result.code, /return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(\(value \+ delta\)\)\);/)
})

test('lowers boolean async task frames to C', () => {
  const result = compileSource(
    `async function flip(flag: boolean): Promise<boolean> {
  const value = await Promise.resolve(flag)

  return Promise.resolve(!value)
}

export async function main(): Promise<void> {
  console.log(await flip(false))
  console.log(await flip(true))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /double param_flag;/)
  assert.match(result.code, /status = ccjs_promise_resolve\(frame->awaited, ccjs_bool_value\(\(flag\) != 0\)\);/)
  assert.match(
    result.code,
    /if \(ccjs_value_input\.tag != CCJS_TAG_BOOL\) \{\n {6}ccjs_status reject_status = ccjs_promise_reject\(frame->promise, ccjs_number_value\(\(ccjs_number\)CCJS_ERR_TYPE\)\);\n {6}return reject_status;\n {4}\}/
  )
  assert.match(result.code, /frame->local_value = ccjs_value_input\.as\.boolean \? 1 : 0;/)
  assert.match(result.code, /double value = frame->local_value;/)
  assert.match(result.code, /return ccjs_promise_resolve\(frame->promise, ccjs_bool_value\(\(\(!value\)\) != 0\)\);/)
  assert.match(
    result.code,
    /if \(ccjs_async_task_flip_start\(&ccjs_loop, 0, &ccjs_promise_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_async_task_flip_start\(&ccjs_loop, 1, &ccjs_promise_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
})

test('lowers async task frame await over local Promise chains to C', () => {
  const result = compileSource(
    `async function addChain(input: number, delta: number): Promise<number> {
  const pending = Promise.resolve(input).then(value => value + 2)
  const value = await pending

  return Promise.resolve(value + delta)
}

export async function main(): Promise<void> {
  console.log(await addChain(2, 4))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_promise_chain_arrow_\d+\(void \*context, ccjs_value ccjs_value_input, ccjs_value \*out\);/
  )
  assert.match(result.code, /ccjs_promise \*ccjs_async_task_source_\d+ = 0;/)
  assert.match(
    result.code,
    /status = ccjs_promise_resolved\(ccjs_loop, ccjs_number_value\(input\), &ccjs_async_task_source_\d+\);/
  )
  assert.match(
    result.code,
    /status = ccjs_promise_chain\(ccjs_async_task_source_\d+, ccjs_promise_chain_arrow_\d+, 0, 0, 0, &frame->awaited\);/
  )
  assert.match(result.code, /ccjs_promise_release\(ccjs_async_task_source_\d+\);/)
  assert.match(
    result.code,
    /status = ccjs_promise_then\(frame->awaited, ccjs_async_task_addChain_resume, ccjs_async_task_addChain_reject, frame, ccjs_async_task_addChain_finalize\);/
  )
  assert.match(result.code, /return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(\(value \+ delta\)\)\);/)
})

test('lowers async task frame await over captured local Promise chains to C', () => {
  const result = compileSource(
    `async function addChain(input: number, delta: number): Promise<number> {
  const pending = Promise.resolve(input).then(value => value + delta)
  const value = await pending

  return value + delta
}

export async function main(): Promise<void> {
  console.log(await addChain(2, 4))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_promise_chain_context_\d+ \{\n {2}double delta;\n\} ccjs_promise_chain_context_\d+;/
  )
  assert.match(result.code, /static void ccjs_promise_chain_context_\d+_finalize\(void \*context\);/)
  assert.match(
    result.code,
    /ccjs_promise_chain_context_\d+\* captured = \(ccjs_promise_chain_context_\d+\*\)context;\n {2}double delta = captured->delta;/
  )
  assert.match(
    result.code,
    /ccjs_promise_chain_context_\d+\* ccjs_promise_callback_ctx_\d+ = ccjs_default_alloc\(0, sizeof\(ccjs_promise_chain_context_\d+\), _Alignof\(ccjs_promise_chain_context_\d+\)\);/
  )
  assert.match(result.code, /ccjs_promise_callback_ctx_\d+->delta = delta;/)
  assert.match(
    result.code,
    /status = ccjs_promise_chain\(ccjs_async_task_source_\d+, ccjs_promise_chain_arrow_\d+, 0, ccjs_promise_callback_ctx_\d+, ccjs_promise_chain_context_\d+_finalize, &frame->awaited\);/
  )
  assert.match(result.code, /return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(\(value \+ delta\)\)\);/)
})

test('lowers async task frame direct return values to C', () => {
  const result = compileSource(
    `async function addLater(input: number, delta: number): Promise<number> {
  const value = await Promise.resolve(input)

  return value + delta
}

export async function main(): Promise<void> {
  console.log(await addLater(2, 4))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /typedef struct ccjs_async_task_addLater_frame \{/)
  assert.match(result.code, /status = ccjs_promise_resolve\(frame->awaited, ccjs_number_value\(input\)\);/)
  assert.match(result.code, /return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(\(value \+ delta\)\)\);/)
  assert.doesNotMatch(result.code, /return Promise\.resolve/)
  assert.doesNotMatch(result.code, /addLater\(2, 4\)/)
})

test('lowers async task frame direct managed return values to C', () => {
  const result = compileSource(
    `async function work(): Promise<Buffer> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      return Buffer.from('ok', 'utf8')
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  console.log(result.toString())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*ccjs_value ccjs_bytes_\d+ = ccjs_undefined_value\(\);[\s\S]*ccjs_bytes_from_data\(&ccjs_default_allocator, \(const uint8_t \*\)"ok", 2, &ccjs_bytes_\d+\)[\s\S]*printf\("%s\\n", "inner"\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*status = ccjs_promise_resolve\(frame->promise, ccjs_bytes_\d+\);[\s\S]*ccjs_release\(ccjs_bytes_\d+\);[\s\S]*return status;/
  )
})

test('lowers multiple awaits in async task frames to C state switches', () => {
  const result = compileSource(
    `async function addTwo(input: number, delta: number): Promise<number> {
  const first = await Promise.resolve(input)
  const second = await Promise.resolve(first + delta)

  return first + second
}

export async function main(): Promise<void> {
  console.log(await addTwo(2, 4))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /int state;/)
  assert.match(result.code, /double local_first;/)
  assert.match(result.code, /double local_second;/)
  assert.match(result.code, /switch \(frame->state\) \{/)
  assert.match(result.code, /case 0: \{/)
  assert.match(result.code, /frame->local_first = ccjs_value_input\.as\.number;/)
  assert.match(result.code, /frame->state = 1;/)
  assert.match(
    result.code,
    /status = ccjs_promise_then\(frame->awaited, ccjs_async_task_addTwo_resume, ccjs_async_task_addTwo_reject, frame, 0\);/
  )
  assert.match(result.code, /status = ccjs_promise_resolve\(frame->awaited, ccjs_number_value\(\(first \+ delta\)\)\);/)
  assert.match(result.code, /case 1: \{/)
  assert.match(result.code, /frame->local_second = ccjs_value_input\.as\.number;/)
  assert.match(result.code, /return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(\(first \+ second\)\)\);/)
})

test('lowers async task frame awaits over local async tasks and plain Promise helpers', () => {
  const result = compileSource(
    `async function immediate(input: number): Promise<number> {
  return input
}

function same(input: number): Promise<number> {
  return Promise.resolve(input)
}

async function addLater(input: number): Promise<number> {
  const value = await Promise.resolve(input)

  return value + 1
}

async function compute(input: number): Promise<number> {
  const zero = await immediate(input)
  const first = await same(zero)
  const second = await addLater(first)
  const third = await same(second)

  return third + 1
}

export async function main(): Promise<void> {
  console.log(await compute(2))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_promise \*same\(ccjs_loop \*ccjs_loop, double input\);/)
  assert.match(
    result.code,
    /status = ccjs_promise_resolved\(ccjs_loop, ccjs_number_value\(immediate\(input\)\), &frame->awaited\);/
  )
  assert.match(result.code, /frame->state = 1;/)
  assert.match(result.code, /frame->awaited = same\(ccjs_loop, zero\);/)
  assert.match(result.code, /status = frame->awaited == 0 \? CCJS_ERR_TYPE : CCJS_OK;/)
  assert.match(result.code, /frame->state = 2;/)
  assert.match(result.code, /status = ccjs_async_task_addLater_start\(ccjs_loop, first, &frame->awaited\);/)
  assert.match(result.code, /frame->state = 3;/)
  assert.match(result.code, /frame->awaited = same\(ccjs_loop, second\);/)
  assert.match(result.code, /return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(\(third \+ 1\)\)\);/)
})

test('lowers async task frame awaits over managed immediate async helpers', () => {
  const result = compileSource(
    `import fs from 'node:fs'

async function sameText(input: string): Promise<string> {
  return input
}

async function sameBytes(input: Buffer): Promise<Buffer> {
  return input
}

async function copy(input: string): Promise<string> {
  const text = await sameText(input)
  const bytes: Buffer = await fs.promises.readFile('/tmp/value.bin')
  const copied: Buffer = await sameBytes(bytes)

  return text
}

export async function main(): Promise<void> {
  console.log(await copy('ok'))
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_value ccjs_async_value_\d+ = sameText\(ccjs_value_\d+\);/)
  assert.match(
    result.code,
    /if \(ccjs_async_value_\d+\.tag != CCJS_TAG_STRING \|\| ccjs_async_value_\d+\.as\.ref == 0\) goto ccjs_start_error;/
  )
  assert.match(result.code, /status = ccjs_promise_resolved\(ccjs_loop, ccjs_async_value_\d+, &frame->awaited\);/)
  assert.match(result.code, /ccjs_release\(ccjs_async_value_\d+\);/)
  assert.match(result.code, /ccjs_start_error:\n {2}ccjs_promise_release\(\*out\);/)
  assert.match(result.code, /ccjs_value ccjs_async_value_\d+ = sameBytes\(bytes\);/)
  assert.match(
    result.code,
    /if \(ccjs_async_value_\d+\.tag != CCJS_TAG_BYTES \|\| ccjs_async_value_\d+\.as\.ref == 0\) return CCJS_ERR_TYPE;/
  )
})

test('lowers async task frame rejected awaits to returned Promise rejections', () => {
  const result = compileSource(
    `function failNumber(): Promise<number> {
  return Promise.reject('task fail')
}

async function compute(): Promise<number> {
  const value = await failNumber()
  const next = await Promise.resolve(value)

  return next
}

async function failDirect(): Promise<number> {
  const value: number = await Promise.reject('direct fail')

  return value
}

export async function main(): Promise<void> {
  try {
    console.log(await compute())
  } catch (error) {
    console.log(error)
  }

  try {
    console.log(await failDirect())
  } catch (error) {
    console.log(error)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /frame->awaited = failNumber\(ccjs_loop\);/)
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_compute_reject\(void \*context, ccjs_value ccjs_error\) \{\n {2}ccjs_async_task_compute_frame \*frame = \(ccjs_async_task_compute_frame \*\)context;\n {2}if \(frame == 0 \|\| frame->promise == 0\) return CCJS_ERR_TYPE;\n {2}ccjs_status status = ccjs_promise_reject\(frame->promise, ccjs_error\);\n {2}if \(frame->state < 1\) \{\n {4}ccjs_async_task_compute_finalize\(frame\);\n {2}\}\n {2}return status;\n\}/
  )
  assert.match(result.code, /status = ccjs_promise_rejected\(ccjs_loop, ccjs_reject_value_\d+, &frame->awaited\);/)
  assert.match(
    result.code,
    /status = ccjs_promise_then\(frame->awaited, ccjs_async_task_failDirect_resume, ccjs_async_task_failDirect_reject, frame, ccjs_async_task_failDirect_finalize\);/
  )
})

test('lowers async task frame try catch finally around awaited promises', () => {
  const result = compileSource(
    `async function recover(): Promise<number> {
  try {
    const value: number = await Promise.reject('inner fail')

    return value
  } catch (error) {
    console.log('caught', error)

    return 7
  } finally {
    console.log('finally recover')
  }
}

async function propagate(): Promise<number> {
  try {
    const value: number = await Promise.reject('outer fail')

    return value
  } finally {
    console.log('finally propagate')
  }
}

export async function main(): Promise<void> {
  console.log(await recover())

  try {
    console.log(await propagate())
  } catch (error) {
    console.log('outer', error)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_recover_reject\(void \*context, ccjs_value ccjs_error\) \{/
  )
  assert.match(
    result.code,
    /case 0: \{\n {4}if \(ccjs_error\.tag != CCJS_TAG_STRING \|\| ccjs_error\.as\.ref == 0\) \{/
  )
  assert.match(result.code, /ccjs_string \*error = \(ccjs_string \*\)ccjs_error\.as\.ref;/)
  assert.match(result.code, /printf\("%s %\.\*s\\n", "caught", \(int\)error->len, error->bytes\);/)
  assert.match(result.code, /printf\("%s\\n", "finally recover"\);/)
  assert.match(result.code, /status = ccjs_promise_resolve\(frame->promise, ccjs_number_value\(7\)\);/)
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_propagate_reject\(void \*context, ccjs_value ccjs_error\) \{[\s\S]*printf\("%s\\n", "finally propagate"\);[\s\S]*status = ccjs_promise_reject\(frame->promise, ccjs_error\);/
  )
})

test('lowers nested async task frame try finally finalizers', () => {
  const result = compileSource(
    `async function compute(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      return value
    } finally {
      console.log('inner finally')
    }
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = compute()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_compute_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_compute_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(value\)\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_compute_reject\(void \*context, ccjs_value ccjs_error\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*status = ccjs_promise_reject\(frame->promise, ccjs_error\);/
  )
})

test('lowers fs awaits through async task frames', () => {
  const result = compileSource(
    `import fs from 'node:fs'

async function loadText(path: string): Promise<string> {
  const text = await fs.promises.readFile(path, 'utf8')

  return text
}

async function loadBytes(path: string): Promise<Buffer> {
  const bytes: Buffer = await fs.promises.readFile(path)

  return bytes
}

async function listEntries(path: string): Promise<Array<string>> {
  const entries: Array<string> = await fs.promises.readdir(path)

  return entries
}

async function saveText(path: string, text: string): Promise<void> {
  await fs.promises.writeFile(path, text)

  return
}

async function saveBytes(path: string, bytes: Buffer): Promise<void> {
  await fs.promises.writeFile(path, bytes)

  return
}

export async function main(): Promise<void> {
  console.log(await loadText('/tmp/in.txt'))
  await saveText('/tmp/out.txt', 'saved')
  const bytes = await loadBytes('/tmp/in.bin')
  await saveBytes('/tmp/out.bin', bytes)
  const entries = await listEntries('/tmp')
  console.log(entries.length)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_async_task_loadText_frame \{[\s\S]*ccjs_value param_path;[\s\S]*ccjs_value local_text;/
  )
  assert.match(result.code, /ccjs_retain\(frame->param_path\);/)
  assert.match(result.code, /ccjs_string \*path = \(ccjs_string \*\)frame->param_path\.as\.ref;/)
  assert.match(result.code, /status = ccjs_fs_read_file\(ccjs_loop, path->bytes, path->len, &frame->awaited\);/)
  assert.match(result.code, /frame->local_text = ccjs_value_input;\n {4}ccjs_retain\(frame->local_text\);/)
  assert.match(result.code, /ccjs_string \*text = \(ccjs_string \*\)frame->local_text\.as\.ref;/)
  assert.match(result.code, /status = ccjs_fs_read_file_bytes\(ccjs_loop, path->bytes, path->len, &frame->awaited\);/)
  assert.match(result.code, /status = ccjs_fs_read_dir\(ccjs_loop, path->bytes, path->len, &frame->awaited\);/)
  assert.match(
    result.code,
    /status = ccjs_fs_write_file\(ccjs_loop, path->bytes, path->len, text->bytes, text->len, &frame->awaited\);/
  )
  assert.match(
    result.code,
    /status = ccjs_fs_write_file_bytes\(ccjs_loop, path->bytes, path->len, bytes, &frame->awaited\);/
  )
  assert.match(result.code, /return ccjs_undefined_value\(\);/)
})

test('lowers awaited plain Promise-returning calls to C', () => {
  const result = compileSource(
    `function getPromise(): Promise<number> {
  return Promise.resolve(2)
}

export async function main(): Promise<void> {
  const value = await getPromise()
  console.log(value)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_promise \*getPromise\(ccjs_loop \*ccjs_loop\);/)
  assert.match(
    result.code,
    /if \(ccjs_promise_resolved\(ccjs_loop, ccjs_number_value\(2\), &ccjs_return\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /ccjs_promise_\d+ = getPromise\(&ccjs_loop\);/)
  assert.match(
    result.code,
    /while \(ccjs_promise_get_state\(ccjs_promise_\d+\) == CCJS_PROMISE_PENDING && ccjs_loop_has_work\(&ccjs_loop\)\) \{/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_get_result\(ccjs_promise_\d+, &ccjs_await_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
})

test('lowers plain Promise helpers over rejection and fs to C', () => {
  const result = compileSource(
    `import fs from 'node:fs'

function failPromise(): Promise<string> {
  return Promise.reject('plain fail')
}

function loadText(): Promise<string> {
  return fs.promises.readFile('/tmp/value.txt', 'utf8')
}

export async function main(): Promise<void> {
  try {
    await failPromise()
  } catch (error) {
    console.log(error)
  }

  const text = await loadText()
  console.log(text)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_promise \*failPromise\(ccjs_loop \*ccjs_loop\);/)
  assert.match(
    result.code,
    /if \(ccjs_promise_rejected\(ccjs_loop, ccjs_value_\d+, &ccjs_return\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /ccjs_promise \*loadText\(ccjs_loop \*ccjs_loop\);/)
  assert.match(
    result.code,
    /if \(ccjs_fs_read_file\(ccjs_loop, "\/tmp\/value\.txt", 14, &ccjs_return\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /ccjs_promise_\d+ = failPromise\(&ccjs_loop\);/)
  assert.match(result.code, /goto ccjs_try_\d+_catch;/)
  assert.match(result.code, /ccjs_promise_\d+ = loadText\(&ccjs_loop\);/)
})

test('reports unhandled owned Promise rejections from generated C main', () => {
  const result = compileSource(
    `export async function main(): Promise<void> {
  Promise.reject('boom')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /static int ccjs_unhandled_rejection = 0;/)
  assert.match(
    result.code,
    /if \(ccjs_promise_\d+ != 0 && ccjs_promise_is_unhandled_rejection\(ccjs_promise_\d+\)\) \{\n {4}fprintf\(stderr, "Unhandled Promise rejection\\n"\);\n {4}ccjs_unhandled_rejection = 1;\n {2}\}/
  )
  assert.match(result.code, /return ccjs_unhandled_rejection == 0 \? \(int\)ccjs_return : 1;/)
})

test('lowers first C async await slice over Promise.resolve and fs promises', () => {
  const result = compileSource(
    `import fs from 'node:fs'

async function loadText(): Promise<string> {
  return fs.promises.readFile('/tmp/out.txt', 'utf8')
}

export async function main(): Promise<void> {
  const promise = Promise.resolve(2)
  const value = await promise
  console.log(await Promise.resolve('ok'))
  console.log(value)
  await fs.promises.writeFile('/tmp/out.txt', 'saved')
  const loaded = loadText()
  const text = await fs.promises.readFile('/tmp/out.txt', 'utf8')
  console.log(await loaded)
  console.log(text)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_value loadText\(void\);/)
  assert.match(result.code, /void ccjs_main\(void\)/)
  assert.match(result.code, /ccjs_promise \*promise = 0;/)
  assert.match(
    result.code,
    /if \(ccjs_promise_resolved\(&ccjs_loop, ccjs_number_value\(2\), &promise\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /while \(ccjs_promise_get_state\(promise\) == CCJS_PROMISE_PENDING && ccjs_loop_has_work\(&ccjs_loop\)\) \{/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_get_result\(promise, &ccjs_await_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_resolved\(&ccjs_loop, ccjs_value_\d+, &ccjs_promise_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_fs_write_file\(&ccjs_loop, "\/tmp\/out\.txt", 12, "saved", 5, &ccjs_promise_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_fs_read_file\(&ccjs_loop, "\/tmp\/out\.txt", 12, &ccjs_promise_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /ccjs_async_value_\d+ = loadText\(\);/)
  assert.match(
    result.code,
    /if \(ccjs_promise_resolved\(&ccjs_loop, ccjs_async_value_\d+, &loaded\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /const ccjs_string \*text = \(ccjs_string \*\)ccjs_await_value_\d+\.as\.ref;/)
})

test('lowers awaited rejected promises into C try catch', () => {
  const result = compileSource(
    `export async function main(): Promise<void> {
  const promise = Promise.reject('fail')

  try {
    await promise
  } catch (error) {
    console.log(error)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /if \(ccjs_promise_rejected\(&ccjs_loop, ccjs_value_\d+, &promise\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /if \(ccjs_promise_get_state\(promise\) == CCJS_PROMISE_REJECTED\) \{/)
  assert.match(result.code, /if \(ccjs_promise_get_result\(promise, &ccjs_error\) != CCJS_OK\)\s+goto ccjs_cleanup;/)
  assert.match(result.code, /ccjs_error_active = 1;/)
  assert.match(result.code, /goto ccjs_try_\d+_catch;/)
})

test('lowers awaited Error rejected promises into C try catch', () => {
  const result = compileSource(
    `export async function main(): Promise<void> {
  const promise = Promise.reject(new Error('stored error'))

  try {
    await promise
  } catch (error) {
    console.log(error.name, error.message)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /if \(ccjs_promise_rejected\(&ccjs_loop, ccjs_error_object_\d+, &promise\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_error\.tag != CCJS_TAG_OBJECT \|\| ccjs_error\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /ccjs_try_\d+_catch:\n {4}if \(ccjs_error\.tag != CCJS_TAG_OBJECT \|\| ccjs_error\.as\.ref == 0\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /ccjs_value error = ccjs_error;/)
  assert.match(result.code, /ccjs_object_get_known\(error, 0, &ccjs_log_value_\d+\)/)
  assert.match(result.code, /ccjs_object_get_known\(error, 1, &ccjs_log_value_\d+\)/)
})

test('lowers awaited throwing async helpers through the C error channel', () => {
  const result = compileSource(
    `async function failText(): Promise<string> {
  throw 'async fail'
}

export async function main(): Promise<void> {
  try {
    const value = await failText()
    console.log(value)
  } catch (error) {
    console.log(error)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_status failText\(ccjs_value \*ccjs_out, ccjs_value \*ccjs_error_out\);/)
  assert.match(result.code, /ccjs_value ccjs_call_result_\d+ = ccjs_undefined_value\(\);/)
  assert.match(result.code, /ccjs_status ccjs_call_status_\d+ = failText\(&ccjs_call_result_\d+, &ccjs_error\);/)
  assert.doesNotMatch(result.code, /double ccjs_call_result_\d+ = 0;\n\s+ccjs_status ccjs_call_status_\d+ = failText/)
  assert.match(result.code, /if \(ccjs_call_status_\d+ == CCJS_ERR_THROW\) \{/)
  assert.match(result.code, /goto ccjs_try_\d+_catch;/)
})

test('lowers async throws after awaits to rejected local promises', () => {
  const stringResult = compileSource(
    `async function failString(): Promise<string> {
  const seed: number = await Promise.resolve(1)
  throw 'bad'
}

export async function main(): Promise<void> {
  const promise = failString()

  try {
    const value = await promise
    console.log(value)
  } catch (error) {
    console.log(error)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    stringResult.code,
    /ccjs_status ccjs_async_status_\d+ = failString\(&ccjs_async_result_\d+, &ccjs_error\);/
  )
  assert.match(
    stringResult.code,
    /if \(ccjs_async_status_\d+ == CCJS_ERR_THROW\) \{\n {4}if \(ccjs_promise_rejected\(&ccjs_loop, ccjs_error, &promise\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    stringResult.code,
    /if \(ccjs_promise_get_result\(promise, &ccjs_error\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(stringResult.code, /goto ccjs_try_\d+_catch;/)

  const errorResult = compileSource(
    `async function failError(): Promise<string> {
  const seed: number = await Promise.resolve(2)
  throw new Error('boom')
}

export async function main(): Promise<void> {
  const promise = failError()

  try {
    const value = await promise
    console.log(value)
  } catch (error) {
    console.log(error.message)
  }
}
`,
    {
      target: 'c'
    }
  )

  assert.match(errorResult.code, /ccjs_value ccjs_error_object_\d+ = ccjs_undefined_value\(\);/)
  assert.match(
    errorResult.code,
    /ccjs_status ccjs_async_status_\d+ = failError\(&ccjs_async_result_\d+, &ccjs_error\);/
  )
  assert.match(
    errorResult.code,
    /if \(ccjs_promise_rejected\(&ccjs_loop, ccjs_error, &promise\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    errorResult.code,
    /if \(ccjs_object_get_known\(error, 1, &ccjs_log_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
})

test('lowers nested async task frame try catch with outer finally', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
      return value
    } catch (error) {
      console.log(error)
      return 7
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(value\)\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_reject\(void \*context, ccjs_value ccjs_error\) \{[\s\S]*ccjs_string \*error = \(ccjs_string \*\)ccjs_error\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*status = ccjs_promise_resolve\(frame->promise, ccjs_number_value\(7\)\);/
  )
})

test('lowers nested async task frame inner finally before outer catch', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
      return value
    } finally {
      console.log('inner finally')
    }
  } catch (error) {
    console.log(error)
    return 7
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(value\)\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_reject\(void \*context, ccjs_value ccjs_error\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*ccjs_string \*error = \(ccjs_string \*\)ccjs_error\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);[\s\S]*status = ccjs_promise_resolve\(frame->promise, ccjs_number_value\(7\)\);/
  )
})

test('lowers nested async task frame inner catch under outer catch', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
      return value
    } catch (error) {
      console.log(error)
      return 7
    }
  } catch (error) {
    console.log(error)
    return 9
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_reject\(void \*context, ccjs_value ccjs_error\) \{[\s\S]*ccjs_string \*error = \(ccjs_string \*\)ccjs_error\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);[\s\S]*status = ccjs_promise_resolve\(frame->promise, ccjs_number_value\(7\)\);/
  )
  assert.doesNotMatch(result.code, /ccjs_number_value\(9\)/)
})

test('lowers deeper nested async task frame try metadata', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      try {
        const value: number = await Promise.reject('inner')
        return value
      } finally {
        console.log('inner finally')
      }
    } catch (error) {
      console.log(error)
      return 7
    } finally {
      console.log('middle finally')
    }
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "middle finally"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(value\)\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_reject\(void \*context, ccjs_value ccjs_error\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*ccjs_string \*error = \(ccjs_string \*\)ccjs_error\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);[\s\S]*printf\("%s\\n", "middle finally"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*status = ccjs_promise_resolve\(frame->promise, ccjs_number_value\(7\)\);/
  )
})

test('lowers nested async task frame try prefixes before first await', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    console.log('outer prefix')
    try {
      console.log('middle prefix')
      try {
        const value: number = await Promise.resolve(3)
        return value
      } finally {
        console.log('inner finally')
      }
    } finally {
      console.log('middle finally')
    }
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\) \{[\s\S]*printf\("%s\\n", "outer prefix"\);[\s\S]*printf\("%s\\n", "middle prefix"\);[\s\S]*status = ccjs_promise_resolve\(frame->awaited, ccjs_number_value\(3\)\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "middle finally"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(value\)\);/
  )
})

test('lowers nested async task frame try prefix declarations into awaited expressions', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    const seed: number = 3
    try {
      const value: number = await Promise.resolve(seed)
      return value
    } finally {
      console.log('outer finally')
    }
  } finally {
    console.log('done')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\) \{[\s\S]*double seed = 3;[\s\S]*status = ccjs_promise_resolve\(frame->awaited, ccjs_number_value\(seed\)\);/
  )
  assert.doesNotMatch(result.code, /prefix_seed/)
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*printf\("%s\\n", "done"\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(value\)\);/
  )
})

test('lowers nested async task frame inner body prefix locals into awaited expressions', () => {
  const result = compileSource(
    `async function work(): Promise<Buffer> {
  try {
    try {
      const prefix: Buffer = Buffer.from('ok', 'utf8')
      const pending: Promise<number> = Promise.resolve(prefix.length)
      const value: number = await pending
      return prefix
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  console.log(result.length, result.toString())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_async_task_work_frame \{[\s\S]*ccjs_value prefix_prefix;[\s\S]*double local_value;[\s\S]*\} ccjs_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\) \{[\s\S]*ccjs_value prefix = ccjs_undefined_value\(\);[\s\S]*ccjs_bytes_from_data\(&ccjs_default_allocator, \(const uint8_t \*\)"ok", 2, &ccjs_bytes_\d+\)[\s\S]*frame->prefix_prefix = prefix;[\s\S]*ccjs_retain\(frame->prefix_prefix\);[\s\S]*ccjs_bytes_len\(prefix, &ccjs_bytes_len_\d+\)[\s\S]*status = ccjs_promise_resolved\(ccjs_loop, ccjs_number_value\(\(\(double\)ccjs_bytes_len_\d+\)\), &frame->awaited\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*ccjs_value prefix = frame->prefix_prefix;[\s\S]*printf\("%s\\n", "inner"\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*return ccjs_promise_resolve\(frame->promise, prefix\);/
  )
  assert.match(
    result.code,
    /static void ccjs_async_task_work_finalize\(void \*context\) \{[\s\S]*ccjs_release\(frame->prefix_prefix\);/
  )
})

test('lowers nested async task frame post await managed locals into inner try returns', () => {
  const result = compileSource(
    `async function work(): Promise<Buffer> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const suffix: Buffer = Buffer.from('ok', 'utf8')
      console.log(value)
      return suffix
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  console.log(result.toString())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_async_task_work_frame \{[\s\S]*double local_value;[\s\S]*\} ccjs_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*double value = frame->local_value;[\s\S]*ccjs_value suffix = ccjs_undefined_value\(\);[\s\S]*ccjs_bytes_from_data\(&ccjs_default_allocator, \(const uint8_t \*\)"ok", 2, &ccjs_bytes_\d+\)[\s\S]*printf\("%g\\n", \(\(double\)value\)\);[\s\S]*printf\("%s\\n", "inner"\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*status = ccjs_promise_resolve\(frame->promise, suffix\);[\s\S]*ccjs_release\(suffix\);[\s\S]*return status;/
  )
})

test('lowers nested async task frame post await scalar locals into inner try returns', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const total: number = value + 4
      console.log(total)
      return total
    } finally {
      console.log('inner')
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  console.log(await work())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_async_task_work_frame \{[\s\S]*double local_value;[\s\S]*\} ccjs_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*double value = frame->local_value;[\s\S]*const double total = \(value \+ 4\);[\s\S]*printf\("%g\\n", \(\(double\)total\)\);[\s\S]*printf\("%s\\n", "inner"\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(total\)\);/
  )
})

test('lowers nested async task frame post await locals before post-nested returns', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const total: number = value + 4
      console.log(total)
    } finally {
      console.log('inner')
    }
    console.log('after')
    return 9
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  console.log(await work())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*double value = frame->local_value;[\s\S]*const double total = \(value \+ 4\);[\s\S]*printf\("%g\\n", \(\(double\)total\)\);[\s\S]*printf\("%s\\n", "inner"\);[\s\S]*printf\("%s\\n", "after"\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(9\)\);/
  )
})

test('lowers nested async task frame post await managed locals before post-nested returns', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
      const scratch: Buffer = Buffer.from('ok', 'utf8')
      console.log(value, scratch.length)
    } finally {
      console.log('inner')
    }
    console.log('after')
    return 9
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  console.log(await work())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*double value = frame->local_value;[\s\S]*ccjs_value scratch = ccjs_undefined_value\(\);[\s\S]*ccjs_bytes_from_data\(&ccjs_default_allocator, \(const uint8_t \*\)"ok", 2, &ccjs_bytes_\d+\)[\s\S]*ccjs_bytes_len\(scratch, &ccjs_bytes_len_\d+\)[\s\S]*printf\("%g %g\\n", \(\(double\)value\), \(\(double\)\(\(double\)ccjs_bytes_len_\d+\)\)\);[\s\S]*printf\("%s\\n", "inner"\);[\s\S]*printf\("%s\\n", "after"\);[\s\S]*ccjs_release\(scratch\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(9\)\);/
  )
})

test('lowers nested async task frame post try statements through finalizers', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log('inner finally')
    }
    console.log('after inner')
    return 7
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "after inner"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(7\)\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_reject\(void \*context, ccjs_value ccjs_error\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*status = ccjs_promise_reject\(frame->promise, ccjs_error\);/
  )
})

test('lowers nested async task frame post try statements with outer catch', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
    } finally {
      console.log('inner finally')
    }
    console.log('after inner')
    return 7
  } catch (error) {
    console.log(error)
    return 9
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.equal((result.code.match(/printf\("%s\\n", "inner finally"\);/g) ?? []).length, 2)
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "after inner"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(7\)\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_reject\(void \*context, ccjs_value ccjs_error\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*ccjs_string \*error = \(ccjs_string \*\)ccjs_error\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*status = ccjs_promise_resolve\(frame->promise, ccjs_number_value\(9\)\);/
  )
})

test('lowers nested async task frame post try statements with inner catch', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
    } catch (error) {
      console.log(error)
      return 9
    } finally {
      console.log('inner finally')
    }
    console.log('after inner')
    return 7
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.equal((result.code.match(/printf\("%s\\n", "inner finally"\);/g) ?? []).length, 2)
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "after inner"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(7\)\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_reject\(void \*context, ccjs_value ccjs_error\) \{[\s\S]*ccjs_string \*error = \(ccjs_string \*\)ccjs_error\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*status = ccjs_promise_resolve\(frame->promise, ccjs_number_value\(9\)\);/
  )
})

test('lowers nested async task frame prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    const seed: number = 4
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log('inner finally')
    }
    const total: number = seed + 5
    console.log(total)
    return seed
  } finally {
    console.log('outer finally')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_async_task_work_frame \{[\s\S]*double prefix_seed;[\s\S]*\} ccjs_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\) \{[\s\S]*const double seed = 4;[\s\S]*frame->prefix_seed = seed;[\s\S]*status = ccjs_promise_resolve\(frame->awaited, ccjs_number_value\(3\)\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*double seed = frame->prefix_seed;[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*const double total = \(seed \+ 5\);[\s\S]*printf\("%g\\n", \(\(double\)total\)\);[\s\S]*printf\("%s\\n", "outer finally"\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_number_value\(seed\)\);/
  )
})

test('lowers nested async task frame string prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(label: string): Promise<string> {
  try {
    const prefix: string = label
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix)
    }
    console.log(prefix)
    return prefix
  } finally {
    console.log(label)
  }
}

export async function main(): Promise<void> {
  const promise = work('Ada')
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_async_task_work_frame \{[\s\S]*ccjs_value param_label;[\s\S]*ccjs_value prefix_prefix;[\s\S]*\} ccjs_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_value ccjs_arg_label, ccjs_promise \*\* out\) \{[\s\S]*const ccjs_string \*prefix = label;[\s\S]*frame->prefix_prefix\.tag = CCJS_TAG_STRING;[\s\S]*frame->prefix_prefix\.as\.ref = \(ccjs_ref \*\)&prefix->header;[\s\S]*ccjs_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*ccjs_string \*prefix = \(ccjs_string \*\)frame->prefix_prefix\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)prefix->len, prefix->bytes\);[\s\S]*printf\("%\.\*s\\n", \(int\)prefix->len, prefix->bytes\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_value_\d+\);/
  )
  assert.match(
    result.code,
    /static void ccjs_async_task_work_finalize\(void \*context\) \{[\s\S]*ccjs_release\(frame->param_label\);[\s\S]*ccjs_release\(frame->prefix_prefix\);/
  )
})

test('lowers nested async task frame produced string prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(count: number): Promise<string> {
  try {
    const prefix: string = String(count)
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix)
    }
    console.log(prefix)
    return prefix
  } finally {
    console.log(count)
  }
}

export async function main(): Promise<void> {
  const promise = work(4)
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_async_task_work_frame \{[\s\S]*double param_count;[\s\S]*ccjs_value prefix_prefix;[\s\S]*\} ccjs_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, double ccjs_arg_count, ccjs_promise \*\* out\) \{[\s\S]*const ccjs_string \*prefix = \(ccjs_string \*\)ccjs_value_\d+\.as\.ref;[\s\S]*frame->prefix_prefix\.tag = CCJS_TAG_STRING;[\s\S]*frame->prefix_prefix\.as\.ref = \(ccjs_ref \*\)&prefix->header;[\s\S]*ccjs_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*ccjs_string \*prefix = \(ccjs_string \*\)frame->prefix_prefix\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)prefix->len, prefix->bytes\);[\s\S]*printf\("%\.\*s\\n", \(int\)prefix->len, prefix->bytes\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_value_\d+\);/
  )
  assert.match(
    result.code,
    /static void ccjs_async_task_work_finalize\(void \*context\) \{[\s\S]*ccjs_release\(frame->prefix_prefix\);/
  )
})

test('lowers nested async task frame raw string prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(): Promise<string> {
  try {
    const prefix: string = 'Ada'
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix)
    }
    console.log(prefix)
    return prefix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_async_task_work_frame \{[\s\S]*ccjs_value prefix_prefix;[\s\S]*\} ccjs_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\) \{[\s\S]*ccjs_value ccjs_value_\d+ = ccjs_undefined_value\(\);[\s\S]*ccjs_string_from_literal\(&ccjs_default_allocator, "Ada", 3, &ccjs_value_\d+\)[\s\S]*const ccjs_string \*prefix = \(ccjs_string \*\)ccjs_value_\d+\.as\.ref;[\s\S]*frame->prefix_prefix\.tag = CCJS_TAG_STRING;[\s\S]*frame->prefix_prefix\.as\.ref = \(ccjs_ref \*\)&prefix->header;[\s\S]*ccjs_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*ccjs_string \*prefix = \(ccjs_string \*\)frame->prefix_prefix\.as\.ref;[\s\S]*printf\("%\.\*s\\n", \(int\)prefix->len, prefix->bytes\);[\s\S]*printf\("%\.\*s\\n", \(int\)prefix->len, prefix->bytes\);[\s\S]*return ccjs_promise_resolve\(frame->promise, ccjs_value_\d+\);/
  )
  assert.match(
    result.code,
    /static void ccjs_async_task_work_finalize\(void \*context\) \{[\s\S]*ccjs_release\(frame->prefix_prefix\);/
  )
})

test('lowers nested async task frame array prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(): Promise<Array<number>> {
  try {
    const prefix: number[] = [2, 4]
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.length)
    }
    console.log(prefix[1])
    return prefix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const promise = work()
  const result: number[] = await promise
  console.log(result[0], result[1])
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_async_task_work_frame \{[\s\S]*ccjs_value prefix_prefix;[\s\S]*\} ccjs_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\) \{[\s\S]*ccjs_value prefix = ccjs_undefined_value\(\);[\s\S]*ccjs_array_new\(&ccjs_default_allocator, 2, &prefix\)[\s\S]*frame->prefix_prefix = prefix;[\s\S]*ccjs_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*ccjs_value prefix = frame->prefix_prefix;[\s\S]*ccjs_array_len\(prefix, &ccjs_array_len_\d+\)[\s\S]*ccjs_array_get\(prefix, 1, &ccjs_log_value_\d+\)[\s\S]*return ccjs_promise_resolve\(frame->promise, prefix\);/
  )
  assert.match(
    result.code,
    /static void ccjs_async_task_work_finalize\(void \*context\) \{[\s\S]*ccjs_release\(frame->prefix_prefix\);/
  )
})

test('lowers nested async task frame bytes prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(): Promise<Buffer> {
  try {
    const prefix: Buffer = Buffer.from('abc', 'utf8')
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.length)
    }
    console.log(prefix[1])
    return prefix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  const text = result.toString()
  console.log(result[0], result[1], text)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_async_task_work_frame \{[\s\S]*ccjs_value prefix_prefix;[\s\S]*\} ccjs_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\) \{[\s\S]*ccjs_value prefix = ccjs_undefined_value\(\);[\s\S]*ccjs_bytes_from_data\(&ccjs_default_allocator, \(const uint8_t \*\)"abc", 3, &ccjs_bytes_\d+\)[\s\S]*frame->prefix_prefix = prefix;[\s\S]*ccjs_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*ccjs_value prefix = frame->prefix_prefix;[\s\S]*ccjs_bytes_len\(prefix, &ccjs_bytes_len_\d+\)[\s\S]*ccjs_bytes_get\(prefix, \(size_t\)\(1\), &ccjs_byte_\d+\)[\s\S]*return ccjs_promise_resolve\(frame->promise, prefix\);/
  )
  assert.match(
    result.code,
    /static void ccjs_async_task_work_finalize\(void \*context\) \{[\s\S]*ccjs_release\(frame->prefix_prefix\);/
  )
})

test('lowers nested async task frame object prefix locals into post try statements', () => {
  const result = compileSource(
    `type User = {
  name: string,
  score: number
}

async function work(): Promise<User> {
  try {
    const prefix: User = { name: 'Ada', score: 7 }
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.name)
    }
    console.log(prefix.score)
    return prefix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: User = await work()
  console.log(result.name, result.score)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_async_task_work_frame \{[\s\S]*ccjs_value prefix_prefix;[\s\S]*\} ccjs_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\) \{[\s\S]*ccjs_value prefix = ccjs_undefined_value\(\);[\s\S]*ccjs_object_new\(&ccjs_default_allocator, &ccjs_shape_prefix_\d+, &prefix\)[\s\S]*frame->prefix_prefix = prefix;[\s\S]*ccjs_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*ccjs_value prefix = frame->prefix_prefix;[\s\S]*ccjs_object_get_known\(prefix, 0, &ccjs_log_value_\d+\)[\s\S]*ccjs_object_get_known\(prefix, 1, &ccjs_log_value_\d+\)[\s\S]*return ccjs_promise_resolve\(frame->promise, prefix\);/
  )
  assert.match(
    result.code,
    /static void ccjs_async_task_work_finalize\(void \*context\) \{[\s\S]*ccjs_release\(frame->prefix_prefix\);/
  )
})

test('lowers nested async task frame Map prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(): Promise<Map<string, number>> {
  try {
    const prefix: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.get('Ada') ?? 0)
    }
    console.log(prefix.get('Grace') ?? 0, prefix.size)
    return prefix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Map<string, number> = await work()
  console.log(result.get('Grace') ?? 0, result.size)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_async_task_work_frame \{[\s\S]*ccjs_value prefix_prefix;[\s\S]*\} ccjs_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\) \{[\s\S]*ccjs_value prefix = ccjs_undefined_value\(\);[\s\S]*ccjs_map_new\(&ccjs_default_allocator, &prefix\)[\s\S]*frame->prefix_prefix = prefix;[\s\S]*ccjs_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*ccjs_value prefix = frame->prefix_prefix;[\s\S]*ccjs_map_get\(prefix, ccjs_value_\d+, &ccjs_map_value_\d+\)[\s\S]*ccjs_map_get\(prefix, ccjs_value_\d+, &ccjs_map_value_\d+\)[\s\S]*ccjs_map_size\(prefix, &ccjs_map_size_\d+\)[\s\S]*return ccjs_promise_resolve\(frame->promise, prefix\);/
  )
  assert.match(
    result.code,
    /static void ccjs_async_task_work_finalize\(void \*context\) \{[\s\S]*ccjs_release\(frame->prefix_prefix\);/
  )
})

test('lowers nested async task frame Set prefix locals into post try statements', () => {
  const result = compileSource(
    `async function work(): Promise<Set<string>> {
  try {
    const prefix: Set<string> = new Set(['Ada', 'Grace'])
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log(prefix.has('Ada'))
    }
    console.log(prefix.has('Grace'), prefix.size)
    return prefix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Set<string> = await work()
  console.log(result.has('Grace'), result.size)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_async_task_work_frame \{[\s\S]*ccjs_value prefix_prefix;[\s\S]*\} ccjs_async_task_work_frame;/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_start\(ccjs_loop \*ccjs_loop, ccjs_promise \*\* out\) \{[\s\S]*ccjs_value prefix = ccjs_undefined_value\(\);[\s\S]*ccjs_set_new\(&ccjs_default_allocator, &prefix\)[\s\S]*frame->prefix_prefix = prefix;[\s\S]*ccjs_retain\(frame->prefix_prefix\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*ccjs_value prefix = frame->prefix_prefix;[\s\S]*ccjs_set_has\(prefix, ccjs_value_\d+, &ccjs_set_has_\d+\)[\s\S]*ccjs_set_has\(prefix, ccjs_value_\d+, &ccjs_set_has_\d+\)[\s\S]*ccjs_set_size\(prefix, &ccjs_set_size_\d+\)[\s\S]*return ccjs_promise_resolve\(frame->promise, prefix\);/
  )
  assert.match(
    result.code,
    /static void ccjs_async_task_work_finalize\(void \*context\) \{[\s\S]*ccjs_release\(frame->prefix_prefix\);/
  )
})

test('lowers nested async task frame post try managed locals into returns', () => {
  const result = compileSource(
    `async function work(): Promise<Buffer> {
  try {
    try {
      const value: number = await Promise.resolve(3)
    } finally {
      console.log('inner')
    }
    const suffix: Buffer = Buffer.from('ok', 'utf8')
    console.log(suffix.length)
    return suffix
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  console.log(result.toString())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_resume\(void \*context, ccjs_value ccjs_value_input\) \{[\s\S]*ccjs_value suffix = ccjs_undefined_value\(\);[\s\S]*ccjs_bytes_from_data\(&ccjs_default_allocator, \(const uint8_t \*\)"ok", 2, &ccjs_bytes_\d+\)[\s\S]*ccjs_bytes_len\(suffix, &ccjs_bytes_len_\d+\)[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*status = ccjs_promise_resolve\(frame->promise, suffix\);[\s\S]*ccjs_release\(suffix\);[\s\S]*return status;/
  )
})

test('lowers nested async task frame catch managed locals into returns', () => {
  const result = compileSource(
    `async function work(): Promise<Buffer> {
  try {
    try {
      const value: Buffer = await Promise.reject('inner')
      return value
    } catch (error) {
      const suffix: Buffer = Buffer.from('ok', 'utf8')
      console.log(error)
      console.log(suffix.length)
      return suffix
    } finally {
      console.log('inner finally')
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  console.log(result.toString())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_reject\(void \*context, ccjs_value ccjs_error\) \{[\s\S]*ccjs_string \*error = \(ccjs_string \*\)ccjs_error\.as\.ref;[\s\S]*ccjs_value suffix = ccjs_undefined_value\(\);[\s\S]*ccjs_bytes_from_data\(&ccjs_default_allocator, \(const uint8_t \*\)"ok", 2, &ccjs_bytes_\d+\)[\s\S]*ccjs_bytes_len\(suffix, &ccjs_bytes_len_\d+\)[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*status = ccjs_promise_resolve\(frame->promise, suffix\);[\s\S]*ccjs_release\(suffix\);[\s\S]*return status;/
  )
})

test('lowers nested async task frame catch direct managed returns', () => {
  const result = compileSource(
    `async function work(): Promise<Buffer> {
  try {
    try {
      const value: Buffer = await Promise.reject('inner')
      return value
    } catch (error) {
      console.log(error)
      return Buffer.from('ok', 'utf8')
    } finally {
      console.log('inner finally')
    }
  } finally {
    console.log('outer')
  }
}

export async function main(): Promise<void> {
  const result: Buffer = await work()
  console.log(result.toString())
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_async_task_work_reject\(void \*context, ccjs_value ccjs_error\) \{[\s\S]*ccjs_string \*error = \(ccjs_string \*\)ccjs_error\.as\.ref;[\s\S]*ccjs_value ccjs_bytes_\d+ = ccjs_undefined_value\(\);[\s\S]*printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);[\s\S]*ccjs_bytes_from_data\(&ccjs_default_allocator, \(const uint8_t \*\)"ok", 2, &ccjs_bytes_\d+\)[\s\S]*printf\("%s\\n", "inner finally"\);[\s\S]*printf\("%s\\n", "outer"\);[\s\S]*status = ccjs_promise_resolve\(frame->promise, ccjs_bytes_\d+\);[\s\S]*ccjs_release\(ccjs_bytes_\d+\);[\s\S]*return status;/
  )
})

test('reports nested async task frame catch throw paths as unsupported', () => {
  assertDiagnostic(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.reject('inner')
      return value
    } catch (error) {
      throw 'catch fail'
    }
  } catch (error) {
    console.log(error)
    return 9
  }
}

export async function main(): Promise<void> {
  console.log(await work())
}
`,
    'CCJS_C_ASYNC',
    {
      target: 'c'
    }
  )
})

test('keeps nested async finalizer throw paths on the non-task-frame fallback', () => {
  const result = compileSource(
    `async function work(): Promise<number> {
  try {
    try {
      const value: number = await Promise.resolve(1)
      return value
    } finally {
      throw 'finally fail'
    }
  } catch (error) {
    console.log(error)
    return 9
  }
}

export async function main(): Promise<void> {
  const promise = work()
  console.log(await promise)
}
`,
    {
      target: 'c'
    }
  )

  assert.doesNotMatch(result.code, /ccjs_async_task_work/)
  assert.match(result.code, /ccjs_try_\d+_finally:/)
  assert.match(result.code, /goto ccjs_try_\d+_catch;/)
})

test('compiles arrow functions and chain calls to JS and C', () => {
  const source = `export function main(): void {
  const values = [3, 1, 2]
  const result = values.sort((left: number, right: number) => left - right).filter(value => value > 1).map(value => value * 2)
  console.log(result[0], result[1])
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.match(js.code, /\(left, right\) => \(left - right\)/)
  assert.match(js.code, /value => \(value > 1\)/)
  assert.match(js.code, /value => \(value \* 2\)/)
  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /ccjs_array_set\(values, ccjs_sort_scan_\d+ - 1, ccjs_sort_right_\d+\)/)
  assert.match(c.code, /ccjs_array_push\(ccjs_filter_array_\d+, ccjs_filter_value_\d+\)/)
  assert.match(c.code, /ccjs_array_push\(ccjs_map_array_\d+, ccjs_number_value/)
})

test('injects Node fs prelude when fs is referenced', () => {
  const result = compileSource(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  await fs.promises.writeFile('/private/tmp/ccjs-fs-smoke.txt', 'hello')
  const text = await fs.promises.readFile('/private/tmp/ccjs-fs-smoke.txt', 'utf8')
  console.log(text)
}
`,
    {
      target: 'js'
    }
  )

  assert.match(result.code, /import \* as fs from 'node:fs\/promises'/)
  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.root),
    ['fs', 'fs']
  )
  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['fs.promises.writeFile', 'fs.promises.readFile']
  )

  const withoutFsUsage = compileSource(
    `export function main(): void {
  console.log('hello')
}
`,
    {
      target: 'js'
    }
  )

  assert.doesNotMatch(withoutFsUsage.code, /import \* as fs from 'node:fs\/promises'/)
})

test('lowers default node:fs import and fs.promises calls to the fs runtime', () => {
  const js = compileSource(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  const bytes: Buffer = await fs.promises.readFile('/tmp/value.bin')
  const text: string = await fs.promises.readFile('/tmp/value.txt', 'utf8')
  const entries = await fs.promises.readdir('/tmp')
  await fs.promises.writeFile('/tmp/out.txt', text)
  await fs.promises.writeFile('/tmp/out.bin', bytes)
  console.log(text, entries[0], bytes.length)
}
`,
    {
      target: 'js'
    }
  )

  assert.match(js.code, /import \* as fs from 'node:fs\/promises'/)
  assert.match(js.code, /const bytes = await fs\.readFile\("\/tmp\/value\.bin"\)/)
  assert.match(js.code, /const text = await fs\.readFile\("\/tmp\/value\.txt", "utf8"\)/)
  assert.match(js.code, /const entries = await fs\.readdir\("\/tmp"\)/)
  assert.match(js.code, /await fs\.writeFile\("\/tmp\/out\.txt", text\)/)
  assert.match(js.code, /await fs\.writeFile\("\/tmp\/out\.bin", bytes\)/)

  const c = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const bytes = fs.promises.readFile('/tmp/value.bin')
  const text = fs.promises.readFile('/tmp/value.txt', 'utf8')
  const entries = fs.promises.readdir('/tmp')
  fs.promises.writeFile('/tmp/out.txt', 'saved')
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const bytes = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'bytes')
  const text = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'text')
  const entries = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'entries')

  assert.equal(bytes?.promiseValueType, 'bytes')
  assert.equal(text?.promiseValueType, 'string')
  assert.equal(entries?.promiseValueType, 'array')
  assert.match(c.code, /ccjs_fs_read_file_bytes\(&ccjs_loop, "\/tmp\/value\.bin", 14, &bytes\)/)
  assert.match(c.code, /ccjs_fs_read_file\(&ccjs_loop, "\/tmp\/value\.txt", 14, &text\)/)
  assert.match(c.code, /ccjs_fs_read_dir\(&ccjs_loop, "\/tmp", 4, &entries\)/)
  assert.match(c.code, /ccjs_fs_write_file\(&ccjs_loop, "\/tmp\/out\.txt", 12, "saved", 5, &ccjs_promise_\d+\)/)
})

test('lowers Node fs stat lstat access and constants to the fs runtime', () => {
  const js = compileSource(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  const stats = await fs.promises.stat('/tmp/value.txt')
  const link = await fs.promises.lstat('/tmp/link.txt')
  await fs.promises.access('/tmp/value.txt', fs.constants.R_OK)
  const syncStats = fs.statSync('/tmp/value.txt')
  fs.accessSync('/tmp/value.txt', fs.constants.F_OK)
  console.log(stats.size, link.mtimeMs, stats.isFile(), syncStats.isDirectory())
}
`,
    {
      target: 'js'
    }
  )

  assert.match(js.code, /import \* as fs from 'node:fs\/promises'/)
  assert.match(js.code, /import \* as ccjsFsSync from 'node:fs'/)
  assert.match(js.code, /const stats = await fs\.stat\("\/tmp\/value\.txt"\)/)
  assert.match(js.code, /const link = await fs\.lstat\("\/tmp\/link\.txt"\)/)
  assert.match(js.code, /await fs\.access\("\/tmp\/value\.txt", ccjsFsSync\.constants\.R_OK\)/)
  assert.match(js.code, /const syncStats = ccjsFsSync\.statSync\("\/tmp\/value\.txt"\)/)
  assert.match(js.code, /ccjsFsSync\.accessSync\("\/tmp\/value\.txt", ccjsFsSync\.constants\.F_OK\)/)

  const c = compileSource(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  const stats = await fs.promises.stat('/tmp/value.txt')
  const link = await fs.promises.lstat('/tmp/link.txt')
  await fs.promises.access('/tmp/value.txt', fs.constants.R_OK)
  const syncStats = fs.statSync('/tmp/value.txt')
  const ok = stats.isFile() && !syncStats.isDirectory()
  console.log(stats.size, link.mode, ok)
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const stats = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'stats')
  const syncStats = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'syncStats')

  assert.equal(stats?.valueType, 'object')
  assert.equal(stats?.init?.shape?.builtin, 'fs.Stats')
  assert.equal(syncStats?.init?.shape?.builtin, 'fs.Stats')
  assert.deepEqual(
    stats?.init?.shape?.fields.map((field) => field.name),
    ['size', 'mode', 'mtimeMs']
  )
  assert.match(c.code, /ccjs_fs_stat\(&ccjs_loop, "\/tmp\/value\.txt", 14, &ccjs_promise_\d+\)/)
  assert.match(c.code, /ccjs_fs_lstat\(&ccjs_loop, "\/tmp\/link\.txt", 13, &ccjs_promise_\d+\)/)
  assert.match(c.code, /ccjs_fs_access\(&ccjs_loop, "\/tmp\/value\.txt", 14, \(\(int\)CCJS_FS_R_OK\), &ccjs_promise_\d+\)/)
  assert.match(
    c.code,
    /if \(ccjs_fs_stat_sync\(&ccjs_default_allocator, "\/tmp\/value\.txt", 14, &ccjs_fs_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(c.code, /ccjs_fs_stats_is_file\(stats\)/)
  assert.match(c.code, /ccjs_fs_stats_is_directory\(syncStats\)/)
})

test('lowers Node fs mutation helpers to the fs runtime', () => {
  const js = compileSource(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  await fs.promises.mkdir('/tmp/ccjs-dir/nested', { recursive: true })
  await fs.promises.rename('/tmp/input.txt', '/tmp/renamed.txt')
  await fs.promises.unlink('/tmp/renamed.txt')
  await fs.promises.rm('/tmp/ccjs-dir', { recursive: true, force: true })
  fs.mkdirSync('/tmp/ccjs-sync/nested', { recursive: true })
  fs.renameSync('/tmp/sync-input.txt', '/tmp/sync-renamed.txt')
  fs.unlinkSync('/tmp/sync-renamed.txt')
  fs.rmSync('/tmp/ccjs-sync', { recursive: true, force: true })
}
`,
    {
      target: 'js'
    }
  )

  assert.match(js.code, /import \* as fs from 'node:fs\/promises'/)
  assert.match(js.code, /import \* as ccjsFsSync from 'node:fs'/)
  assert.match(js.code, /await fs\.mkdir\("\/tmp\/ccjs-dir\/nested", \{ recursive: true \}\)/)
  assert.match(js.code, /await fs\.rename\("\/tmp\/input\.txt", "\/tmp\/renamed\.txt"\)/)
  assert.match(js.code, /await fs\.unlink\("\/tmp\/renamed\.txt"\)/)
  assert.match(js.code, /await fs\.rm\("\/tmp\/ccjs-dir", \{ recursive: true, force: true \}\)/)
  assert.match(js.code, /ccjsFsSync\.mkdirSync\("\/tmp\/ccjs-sync\/nested", \{ recursive: true \}\)/)
  assert.match(js.code, /ccjsFsSync\.renameSync\("\/tmp\/sync-input\.txt", "\/tmp\/sync-renamed\.txt"\)/)
  assert.match(js.code, /ccjsFsSync\.unlinkSync\("\/tmp\/sync-renamed\.txt"\)/)
  assert.match(js.code, /ccjsFsSync\.rmSync\("\/tmp\/ccjs-sync", \{ recursive: true, force: true \}\)/)

  const c = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const mkdirPromise = fs.promises.mkdir('/tmp/ccjs-dir/nested', { recursive: true })
  fs.promises.rename('/tmp/input.txt', '/tmp/renamed.txt')
  fs.promises.unlink('/tmp/renamed.txt')
  fs.promises.rm('/tmp/ccjs-dir', { recursive: true, force: true })
  fs.mkdirSync('/tmp/ccjs-sync/nested', { recursive: true })
  fs.renameSync('/tmp/sync-input.txt', '/tmp/sync-renamed.txt')
  fs.unlinkSync('/tmp/sync-renamed.txt')
  fs.rmSync('/tmp/ccjs-sync', { recursive: true, force: true })
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const mkdirPromise = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'mkdirPromise')

  assert.equal(mkdirPromise?.valueType, 'promise')
  assert.equal(mkdirPromise?.promiseValueType, 'void')
  assert.equal(mkdirPromise?.init?.fsRecursive, true)
  assert.deepEqual(c.ir.runtimeRequirements, ['async-runtime', 'fs', 'managed-values', 'objects'])
  assert.match(c.code, /ccjs_fs_mkdir\(&ccjs_loop, "\/tmp\/ccjs-dir\/nested", 20, true, &mkdirPromise\)/)
  assert.match(
    c.code,
    /ccjs_fs_rename\(&ccjs_loop, "\/tmp\/input\.txt", 14, "\/tmp\/renamed\.txt", 16, &ccjs_promise_\d+\)/
  )
  assert.match(c.code, /ccjs_fs_unlink\(&ccjs_loop, "\/tmp\/renamed\.txt", 16, &ccjs_promise_\d+\)/)
  assert.match(c.code, /ccjs_fs_rm\(&ccjs_loop, "\/tmp\/ccjs-dir", 13, true, true, &ccjs_promise_\d+\)/)
  assert.match(c.code, /ccjs_fs_mkdir_sync\("\/tmp\/ccjs-sync\/nested", 21, true\)/)
  assert.match(c.code, /ccjs_fs_rename_sync\("\/tmp\/sync-input\.txt", 19, "\/tmp\/sync-renamed\.txt", 21\)/)
  assert.match(c.code, /ccjs_fs_unlink_sync\("\/tmp\/sync-renamed\.txt", 21\)/)
  assert.match(c.code, /ccjs_fs_rm_sync\("\/tmp\/ccjs-sync", 14, true, true\)/)

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  const recursive = true
  fs.promises.mkdir('/tmp/ccjs-dir', { recursive })
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('lowers Node fs append and copy helpers to the fs runtime', () => {
  const js = compileSource(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  await fs.promises.appendFile('/tmp/log.txt', 'a')
  await fs.promises.copyFile('/tmp/log.txt', '/tmp/log.copy.txt')
  fs.appendFileSync('/tmp/sync-log.txt', 'b')
  fs.copyFileSync('/tmp/sync-log.txt', '/tmp/sync-log.copy.txt')
}
`,
    {
      target: 'js'
    }
  )

  assert.match(js.code, /import \* as fs from 'node:fs\/promises'/)
  assert.match(js.code, /import \* as ccjsFsSync from 'node:fs'/)
  assert.match(js.code, /await fs\.appendFile\("\/tmp\/log\.txt", "a"\)/)
  assert.match(js.code, /await fs\.copyFile\("\/tmp\/log\.txt", "\/tmp\/log\.copy\.txt"\)/)
  assert.match(js.code, /ccjsFsSync\.appendFileSync\("\/tmp\/sync-log\.txt", "b"\)/)
  assert.match(js.code, /ccjsFsSync\.copyFileSync\("\/tmp\/sync-log\.txt", "\/tmp\/sync-log\.copy\.txt"\)/)

  const c = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const bytes = fs.readFileSync('/tmp/value.bin')
  const appendPromise = fs.promises.appendFile('/tmp/out.bin', bytes)
  fs.promises.copyFile('/tmp/out.bin', '/tmp/log.copy.txt')
  fs.appendFileSync('/tmp/sync.bin', bytes)
  fs.copyFileSync('/tmp/sync.bin', '/tmp/sync-log.copy.txt')
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const appendPromise = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'appendPromise')

  assert.equal(appendPromise?.valueType, 'promise')
  assert.equal(appendPromise?.promiseValueType, 'void')
  assert.equal(appendPromise?.init?.fsRuntimeMethod, 'appendFileBytes')
  assert.match(c.code, /ccjs_fs_read_file_bytes_sync\(&ccjs_default_allocator, "\/tmp\/value\.bin", 14, &ccjs_fs_value_\d+\)/)
  assert.match(c.code, /ccjs_fs_append_file_bytes\(&ccjs_loop, "\/tmp\/out\.bin", 12, bytes, &appendPromise\)/)
  assert.match(
    c.code,
    /ccjs_fs_copy_file\(&ccjs_loop, "\/tmp\/out\.bin", 12, "\/tmp\/log\.copy\.txt", 17, &ccjs_promise_\d+\)/
  )
  assert.match(c.code, /ccjs_fs_append_file_bytes_sync\("\/tmp\/sync\.bin", 13, bytes\)/)
  assert.match(c.code, /ccjs_fs_copy_file_sync\("\/tmp\/sync\.bin", 13, "\/tmp\/sync-log\.copy\.txt", 22\)/)

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  fs.promises.copyFile('/tmp/a', '/tmp/b', 1)
}
`,
    'CCJS_ARG_COUNT'
  )
})

test('lowers Node fs readdir withFileTypes to Dirent runtime values', () => {
  const js = compileSource(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  const entries = await fs.promises.readdir('/tmp', { withFileTypes: true })
  const first = entries[0]
  const syncEntries = fs.readdirSync('/tmp', { withFileTypes: true })
  console.log(first.name, first.isFile(), syncEntries[0].isDirectory())
}
`,
    {
      target: 'js'
    }
  )

  assert.match(js.code, /const entries = await fs\.readdir\("\/tmp", \{ withFileTypes: true \}\)/)
  assert.match(js.code, /const syncEntries = ccjsFsSync\.readdirSync\("\/tmp", \{ withFileTypes: true \}\)/)

  const c = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const entries = fs.promises.readdir('/tmp', { withFileTypes: true })
  const syncEntries = fs.readdirSync('/tmp', { withFileTypes: true })
  const first = syncEntries[0]
  console.log(first.name, first.isFile(), first.isDirectory())
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const entries = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'entries')
  const syncEntries = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'syncEntries')
  const first = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'first')

  assert.equal(entries?.promiseValueType, 'array')
  assert.equal(entries?.arrayElementType, 'object')
  assert.equal(entries?.arrayElementDeclaredType, 'fs.Dirent')
  assert.equal(syncEntries?.arrayElementDeclaredType, 'fs.Dirent')
  assert.equal(first?.arrayElementDeclaredType, 'fs.Dirent')
  assert.equal(first?.init?.shape?.builtin, 'fs.Dirent')
  assert.match(c.code, /ccjs_fs_read_dir_dirents\(&ccjs_loop, "\/tmp", 4, &entries\)/)
  assert.match(
    c.code,
    /ccjs_fs_read_dir_dirents_sync\(&ccjs_default_allocator, "\/tmp", 4, &ccjs_fs_value_\d+\)/
  )
  assert.match(c.code, /ccjs_fs_dirent_is_file\(first\)/)
  assert.match(c.code, /ccjs_fs_dirent_is_directory\(first\)/)

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  fs.promises.readdir('/tmp', { withFileTypes: true, recursive: true })
}
`,
    'CCJS_UNKNOWN_FIELD'
  )
})

test('lowers Node fs link path helpers to the fs runtime', () => {
  const js = compileSource(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  await fs.promises.symlink('/tmp/value.txt', '/tmp/link.txt')
  const target = await fs.promises.readlink('/tmp/link.txt')
  const resolved = await fs.promises.realpath('/tmp/value.txt')
  fs.symlinkSync('/tmp/value.txt', '/tmp/sync-link.txt')
  const syncTarget = fs.readlinkSync('/tmp/sync-link.txt')
  const syncResolved = fs.realpathSync('/tmp/value.txt')
  console.log(target, resolved, syncTarget, syncResolved)
}
`,
    {
      target: 'js'
    }
  )

  assert.match(js.code, /await fs\.symlink\("\/tmp\/value\.txt", "\/tmp\/link\.txt"\)/)
  assert.match(js.code, /const target = await fs\.readlink\("\/tmp\/link\.txt"\)/)
  assert.match(js.code, /const resolved = await fs\.realpath\("\/tmp\/value\.txt"\)/)
  assert.match(js.code, /ccjsFsSync\.symlinkSync\("\/tmp\/value\.txt", "\/tmp\/sync-link\.txt"\)/)
  assert.match(js.code, /const syncTarget = ccjsFsSync\.readlinkSync\("\/tmp\/sync-link\.txt"\)/)
  assert.match(js.code, /const syncResolved = ccjsFsSync\.realpathSync\("\/tmp\/value\.txt"\)/)

  const c = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const real = fs.promises.realpath('/tmp/value.txt')
  const link = fs.promises.readlink('/tmp/link.txt')
  fs.promises.symlink('/tmp/value.txt', '/tmp/link.txt')
  const syncReal = fs.realpathSync('/tmp/value.txt')
  const syncLink = fs.readlinkSync('/tmp/link.txt')
  fs.symlinkSync('/tmp/value.txt', '/tmp/sync-link.txt')
  console.log(syncReal, syncLink)
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const real = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'real')
  const link = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'link')

  assert.equal(real?.promiseValueType, 'string')
  assert.equal(link?.promiseValueType, 'string')
  assert.match(c.code, /ccjs_fs_realpath\(&ccjs_loop, "\/tmp\/value\.txt", 14, &real\)/)
  assert.match(c.code, /ccjs_fs_readlink\(&ccjs_loop, "\/tmp\/link\.txt", 13, &link\)/)
  assert.match(
    c.code,
    /ccjs_fs_symlink\(&ccjs_loop, "\/tmp\/value\.txt", 14, "\/tmp\/link\.txt", 13, &ccjs_promise_\d+\)/
  )
  assert.match(c.code, /ccjs_fs_realpath_sync\(&ccjs_default_allocator, "\/tmp\/value\.txt", 14, &ccjs_fs_value_\d+\)/)
  assert.match(c.code, /ccjs_fs_readlink_sync\(&ccjs_default_allocator, "\/tmp\/link\.txt", 13, &ccjs_fs_value_\d+\)/)
  assert.match(c.code, /ccjs_fs_symlink_sync\("\/tmp\/value\.txt", 14, "\/tmp\/sync-link\.txt", 18\)/)

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  fs.promises.symlink('/tmp/value.txt')
}
`,
    'CCJS_ARG_COUNT'
  )
})

test('lowers node:fs/promises imports to the fs runtime', () => {
  const js = compileSource(
    `import fs from 'node:fs/promises'

export async function main(): Promise<void> {
  const bytes: Buffer = await fs.readFile('/tmp/value.bin')
  const text: string = await fs.readFile('/tmp/value.txt', 'utf8')
  const entries = await fs.readdir('/tmp')
  await fs.writeFile('/tmp/out.txt', text)
  await fs.writeFile('/tmp/out.bin', bytes)
  console.log(text, entries[0], bytes.length)
}
`,
    {
      target: 'js'
    }
  )

  assert.match(js.code, /import \* as fs from 'node:fs\/promises'/)
  assert.match(js.code, /const bytes = await fs\.readFile\("\/tmp\/value\.bin"\)/)
  assert.match(js.code, /const text = await fs\.readFile\("\/tmp\/value\.txt", "utf8"\)/)
  assert.match(js.code, /const entries = await fs\.readdir\("\/tmp"\)/)
  assert.match(js.code, /await fs\.writeFile\("\/tmp\/out\.txt", text\)/)
  assert.match(js.code, /await fs\.writeFile\("\/tmp\/out\.bin", bytes\)/)

  const c = compileSource(
    `import fs from 'node:fs/promises'

export function main(): void {
  const bytes = fs.readFile('/tmp/value.bin')
  const text = fs.readFile('/tmp/value.txt', 'utf8')
  const entries = fs.readdir('/tmp')
  fs.writeFile('/tmp/out.txt', 'saved')
}
`,
    {
      target: 'c'
    }
  )

  assert.match(c.code, /ccjs_fs_read_file_bytes\(&ccjs_loop, "\/tmp\/value\.bin", 14, &bytes\)/)
  assert.match(c.code, /ccjs_fs_read_file\(&ccjs_loop, "\/tmp\/value\.txt", 14, &text\)/)
  assert.match(c.code, /ccjs_fs_read_dir\(&ccjs_loop, "\/tmp", 4, &entries\)/)
  assert.match(c.code, /ccjs_fs_write_file\(&ccjs_loop, "\/tmp\/out\.txt", 12, "saved", 5, &ccjs_promise_\d+\)/)
})

test('maps Node fs binary reads to Buffer-compatible JS and C runtime calls', () => {
  const js = compileSource(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  const bytes: Buffer = await fs.promises.readFile('/tmp/value.bin')
  const view: Uint8Array = bytes
  await fs.promises.writeFile('/tmp/out.bin', view)
}
`,
    {
      target: 'js'
    }
  )

  assert.match(js.code, /import \* as fs from 'node:fs\/promises'/)
  assert.match(js.code, /const bytes = await fs\.readFile\("\/tmp\/value\.bin"\)/)
  assert.match(js.code, /const view = bytes/)
  assert.match(js.code, /await fs\.writeFile\("\/tmp\/out\.bin", view\)/)

  const c = compileSource(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  const bytes = await fs.promises.readFile('/tmp/value.bin')
  await fs.promises.writeFile('/tmp/out.bin', bytes)
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const bytes = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'bytes')

  assert.ok(bytes)
  assert.equal(bytes.valueType, 'bytes')
  assert.match(c.code, /#include "ccjs\/fs\.h"/)
  assert.match(c.code, /ccjs_value bytes = ccjs_undefined_value\(\);/)
  assert.match(
    c.code,
    /if \(ccjs_fs_read_file_bytes\(&ccjs_loop, "\/tmp\/value\.bin", 14, &ccjs_promise_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(c.code, /if \(bytes\.tag != CCJS_TAG_BYTES \|\| bytes\.as\.ref == 0\)\s+goto ccjs_cleanup;/)
  assert.match(
    c.code,
    /if \(ccjs_fs_write_file_bytes\(&ccjs_loop, "\/tmp\/out\.bin", 12, bytes, &ccjs_promise_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )

  assertDiagnostic(
    `import fs from 'node:fs'

export async function main(): Promise<void> {
  await fs.writeFileBytes('/tmp/out.bin', Buffer.from('text'))
}
`,
    'CCJS_FS_UNSUPPORTED'
  )
})

test('lowers Buffer and Uint8Array APIs to C binary runtime calls', () => {
  const result = compileSource(
    `export function main(): void {
  const bytes = Buffer.from('hi', 'utf8')
  const out = new Uint8Array(4)
  out[0] = bytes[0]
  out[1] = 7
  const slice = out.slice(0, 2)
  const text = bytes.toString()
  console.log(bytes.length, out[1], slice.length, text)
}
`,
    {
      target: 'c'
    }
  )

  assert.equal(result.hir.body[0].body.find((item) => item.name === 'bytes')?.valueType, 'bytes')
  assert.equal(result.hir.body[0].body.find((item) => item.name === 'out')?.valueType, 'bytes')
  assert.deepEqual(result.ir.runtimeRequirements, ['binary', 'managed-values', 'string-bytes'])
  assert.match(result.code, /#include "ccjs\/binary\.h"/)
  assert.match(
    result.code,
    /ccjs_bytes_from_data\(&ccjs_default_allocator, \(const uint8_t \*\)"hi", 2, &ccjs_bytes_\d+\)/
  )
  assert.match(result.code, /ccjs_bytes_new\(&ccjs_default_allocator, \(size_t\)\(4\), &ccjs_bytes_\d+\)/)
  assert.match(result.code, /ccjs_bytes_get\(bytes, \(size_t\)\(0\), &ccjs_byte_\d+\)/)
  assert.match(result.code, /ccjs_bytes_set\(out, \(size_t\)\(1\), \(uint8_t\)\(7\)\)/)
  assert.match(result.code, /double ccjs_bytes_start_raw_\d+ = 0;/)
  assert.match(result.code, /double ccjs_bytes_end_raw_\d+ = 2;/)
  assert.match(result.code, /ccjs_bytes_slice\(out, ccjs_bytes_start_\d+, ccjs_bytes_end_\d+, &ccjs_bytes_slice_\d+\)/)
  assert.match(result.code, /ccjs_bytes_to_string\(&ccjs_default_allocator, bytes, &ccjs_bytes_string_\d+\)/)

  const arrayLiteral = compileSource(
    `export function main(): void {
  const bytes = new Uint8Array([1, 2, 3])
  console.log(bytes.length, bytes[2])
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(arrayLiteral.ir.runtimeRequirements, ['binary', 'managed-values', 'string-bytes'])
  assert.doesNotMatch(arrayLiteral.code, /#include "ccjs\/array\.h"/)
  assert.match(arrayLiteral.code, /ccjs_bytes_new\(&ccjs_default_allocator, 3, &ccjs_bytes_\d+\)/)
  assert.match(arrayLiteral.code, /ccjs_bytes_set\(ccjs_bytes_\d+, 2, \(uint8_t\)\(3\)\)/)

  assertDiagnostic(
    `export function main(): void {
  const bytes = Buffer.from('hi', 'hex')
  console.log(bytes.length)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('types and lowers crypto.getRandomValues as a bytes-preserving call', () => {
  const source = `export function main(): void {
  const bytes = Buffer.alloc(4)
  const filled = crypto.getRandomValues(bytes)
  console.log(filled.length)
}
`
  const js = compileSource(source, {
    target: 'js'
  })

  assert.deepEqual(js.ir.features, ['binary', 'crypto', 'runtime-values', 'string-bytes'])
  assert.deepEqual(js.ir.runtimeRequirements, ['binary', 'managed-values', 'string-bytes'])
  assert.deepEqual(
    js.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['Buffer.alloc', 'crypto.getRandomValues']
  )
  assert.match(js.code, /const filled = crypto\.getRandomValues\(bytes\)/)

  const c = compileSource(source, {
    target: 'c'
  })

  assert.match(c.code, /#include <stdint\.h>/)
  assert.match(c.code, /#include "ccjs\/binary\.h"/)
  assert.match(c.code, /static int ccjs_os_random_bytes\(uint8_t \*out, size_t len\)/)
  assert.match(c.code, /static ccjs_status ccjs_crypto_get_random_values\(ccjs_value value\)/)
  assert.match(c.code, /if \(ccjs_crypto_get_random_values\(bytes\) != CCJS_OK\)\s+goto ccjs_cleanup;/)
  assert.match(c.code, /ccjs_retain\(ccjs_crypto_bytes_\d+\);/)

  const withoutCryptoMetadata = JSON.parse(JSON.stringify(c.ir))
  stripCryptoRuntimeMetadata(withoutCryptoMetadata)
  assert.throws(
    () => emitCFromIr(withoutCryptoMetadata),
    (error: unknown) => {
      assert.ok(error instanceof CompileError)
      assert.equal(error.diagnostics[0]?.code, 'CCJS_C_JS_GLOBAL')
      return true
    }
  )

  assertDiagnostic(
    `export function main(): void {
  crypto.getRandomValues('text')
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  crypto.getRandomValues()
}
`,
    'CCJS_ARG_COUNT'
  )
})

function stripCryptoRuntimeMetadata(node: unknown): void {
  if (node == null || typeof node !== 'object') {
    return
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      stripCryptoRuntimeMetadata(item)
    }
    return
  }

  const record = node as Record<string, unknown>

  delete record.cryptoRuntimeMethod

  for (const value of Object.values(record)) {
    stripCryptoRuntimeMetadata(value)
  }
}

test('maps fs sync helpers to Node fs and C runtime calls', () => {
  const js = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const text = fs.readFileSync('/tmp/value.txt', 'utf8')
  const bytes: Buffer = fs.readFileSync('/tmp/value.bin')
  const entries = fs.readdirSync('/tmp')
  fs.writeFileSync('/tmp/out.txt', text)
  fs.writeFileSync('/tmp/out.bin', bytes)
  console.log(entries[0])
}
`,
    {
      target: 'js'
    }
  )

  assert.doesNotMatch(js.code, /node:fs\/promises/)
  assert.match(js.code, /import \* as ccjsFsSync from 'node:fs'/)
  assert.match(js.code, /const text = ccjsFsSync\.readFileSync\("\/tmp\/value\.txt", "utf8"\)/)
  assert.match(js.code, /const bytes = ccjsFsSync\.readFileSync\("\/tmp\/value\.bin"\)/)
  assert.match(js.code, /const entries = ccjsFsSync\.readdirSync\("\/tmp"\)/)
  assert.match(js.code, /ccjsFsSync\.writeFileSync\("\/tmp\/out\.txt", text\)/)
  assert.match(js.code, /ccjsFsSync\.writeFileSync\("\/tmp\/out\.bin", bytes\)/)

  const c = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const text = fs.readFileSync('/tmp/value.txt', 'utf8')
  const bytes = fs.readFileSync('/tmp/value.bin')
  const entries = fs.readdirSync('/tmp')
  fs.writeFileSync('/tmp/out.txt', text)
  fs.writeFileSync('/tmp/out.bin', bytes)
  console.log(entries.length)
}
`,
    {
      target: 'c'
    }
  )
  const main = c.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const text = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'text')
  const bytes = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'bytes')
  const entries = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'entries')

  assert.equal(text?.valueType, 'string')
  assert.equal(bytes?.valueType, 'bytes')
  assert.equal(entries?.valueType, 'array')
  assert.equal(entries?.arrayElementType, 'string')
  assert.match(
    c.code,
    /if \(ccjs_fs_read_file_sync\(&ccjs_default_allocator, "\/tmp\/value\.txt", 14, &ccjs_fs_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    c.code,
    /if \(ccjs_fs_read_file_bytes_sync\(&ccjs_default_allocator, "\/tmp\/value\.bin", 14, &ccjs_fs_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    c.code,
    /if \(ccjs_fs_read_dir_sync\(&ccjs_default_allocator, "\/tmp", 4, &ccjs_fs_value_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    c.code,
    /if \(ccjs_fs_write_file_sync\("\/tmp\/out\.txt", 12, text->bytes, text->len\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    c.code,
    /if \(ccjs_fs_write_file_bytes_sync\("\/tmp\/out\.bin", 12, bytes\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  fs.writeFileBytesSync('/tmp/out.bin', Buffer.from('text'))
}
`,
    'CCJS_FS_UNSUPPORTED'
  )
})

test('injects Node http prelude when http is referenced', () => {
  const result = compileSource(
    `export function main(): void {
  const server = http.createServer((request, response) => {
    response.end('ok')
  })
  server.close()
}
`,
    {
      target: 'js'
    }
  )

  assert.match(result.code, /import \* as http from 'node:http'/)
  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.root),
    ['http']
  )
  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['http.createServer']
  )

  const withoutGlobalUsage = emitJsFromIr({
    ...result.ir,
    globalUsages: []
  })

  assert.doesNotMatch(withoutGlobalUsage, /import \* as http from 'node:http'/)
})

test('drives JS Node prelude from stored target-neutral IR global roots', () => {
  const result = compileSource(
    `export function main(): void {
  console.log('ok')
}
`,
    {
      target: 'js'
    }
  )
  const globalUsages = [
    {
      root: 'http',
      path: ['http', 'createServer']
    },
    {
      root: 'fs',
      path: ['fs', 'promises', 'writeFile']
    },
    {
      root: 'fs',
      path: ['fs', 'promises', 'readFile']
    }
  ]
  const code = emitJsFromIr({
    ...result.ir,
    globalUsages
  })

  assert.deepEqual(result.ir.globalUsages, [])
  assert.deepEqual(
    collectIrGlobalRoots([
      {
        globalUsages
      }
    ]),
    ['fs', 'http']
  )
  assert.match(code, /import \* as fs from 'node:fs\/promises'/)
  assert.match(code, /import \* as http from 'node:http'/)
})

test('lowers Date.now and performance.now to the C time runtime', () => {
  const result = compileSource(
    `export function main(): void {
  const started = Date.now()
  const elapsed = performance.now()
  console.log(started, elapsed)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /#include "ccjs\/time\.h"/)
  assert.match(result.code, /double started = ccjs_date_now\(\);/)
  assert.match(result.code, /double elapsed = ccjs_performance_now\(\);/)
})

test('lowers supported Math calls to C helpers', () => {
  const result = compileSource(
    `export function main(): void {
  const value = Math.floor(3.8) + Math.ceil(2.1) + Math.round(1.6) + Math.trunc(4.9) + Math.fround(16777217) + Math.abs(-5) + Math.min(8, 2) + Math.max(1, 6) + Math.sqrt(9) + Math.sin(0) + Math.cos(0) + Math.random()
  console.log(value)
}
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.globalUsages.map((usage) => usage.path.join('.')).sort(), [
    'Math.abs',
    'Math.ceil',
    'Math.cos',
    'Math.floor',
    'Math.fround',
    'Math.max',
    'Math.min',
    'Math.random',
    'Math.round',
    'Math.sin',
    'Math.sqrt',
    'Math.trunc'
  ])
  assert.match(result.code, /#include <stdint\.h>/)
  assert.match(result.code, /static uint32_t ccjs_math_random_state = 0x6d2b79f5u;/)
  assert.match(result.code, /static double ccjs_math_floor\(double value\)/)
  assert.match(result.code, /static double ccjs_math_fround\(double value\)/)
  assert.match(result.code, /static double ccjs_math_max\(double left, double right\)/)
  assert.match(result.code, /static double ccjs_math_sqrt\(double value\)/)
  assert.match(result.code, /static double ccjs_math_random\(void\)/)
  assert.match(result.code, /ccjs_math_floor\(3\.8\)/)
  assert.match(result.code, /ccjs_math_ceil\(2\.1\)/)
  assert.match(result.code, /ccjs_math_round\(1\.6\)/)
  assert.match(result.code, /ccjs_math_trunc\(4\.9\)/)
  assert.match(result.code, /ccjs_math_fround\(16777217\)/)
  assert.match(result.code, /ccjs_math_abs\(\(-5\)\)/)
  assert.match(result.code, /ccjs_math_min\(8, 2\)/)
  assert.match(result.code, /ccjs_math_max\(1, 6\)/)
  assert.match(result.code, /ccjs_math_sqrt\(9\)/)
  assert.match(result.code, /ccjs_math_sin\(0\)/)
  assert.match(result.code, /ccjs_math_cos\(0\)/)
  assert.match(result.code, /ccjs_math_random\(\)/)

  assertDiagnostic(
    `export function main(): void {
  const value = Math.max(1)
  console.log(value)
}
`,
    'CCJS_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  const value = Math.random(1)
  console.log(value)
}
`,
    'CCJS_ARG_COUNT'
  )
})

test('configures C Math.random seed through compiler options', () => {
  const result = compileSource(
    `export function main(): void {
  const value = Math.random()
  console.log(value)
}
`,
    {
      target: 'c',
      random: {
        seed: 1
      }
    }
  )

  assert.match(result.code, /static uint32_t ccjs_math_random_state = 0x00000001u;/)
})

test('configures C Math.random xorshift32 backend through compiler options', () => {
  const result = compileSource(
    `export function main(): void {
  const value = Math.random()
  console.log(value)
}
`,
    {
      target: 'c',
      random: {
        backend: 'xorshift32',
        seed: 1
      }
    }
  )

  assert.match(result.code, /static uint32_t ccjs_math_random_state = 0x00000001u;/)
  assert.match(result.code, /if \(ccjs_math_random_state == 0u\) ccjs_math_random_state = 0x6d2b79f5u;/)
  assert.match(result.code, /value \^= value << 13;/)
  assert.match(result.code, /value \^= value >> 17;/)
  assert.match(result.code, /value \^= value << 5;/)
  assert.doesNotMatch(result.code, /1664525u \+ 1013904223u/)
})

test('configures C Math.random os backend through compiler options', () => {
  const result = compileSource(
    `export function main(): void {
  const value = Math.random()
  console.log(value)
}
`,
    {
      target: 'c',
      random: {
        backend: 'os',
        seed: 1
      }
    }
  )

  assert.match(result.code, /#define _CRT_RAND_S/)
  assert.match(result.code, /#include <sys\/random\.h>/)
  assert.match(result.code, /static uint32_t ccjs_math_random_state = 0x00000001u;/)
  assert.match(result.code, /static int ccjs_os_random_bytes\(uint8_t \*out, size_t len\)/)
  assert.match(result.code, /rand_s\(&value\)/)
  assert.match(result.code, /arc4random_buf\(out, len\);/)
  assert.match(result.code, /getrandom\(out \+ filled, len - filled, 0\)/)
  assert.match(result.code, /open\("\/dev\/urandom", O_RDONLY\)/)
  assert.match(result.code, /if \(!ccjs_os_random_bytes\(\(uint8_t \*\)&value, sizeof\(value\)\)\) \{/)
  assert.match(result.code, /ccjs_math_random_state = ccjs_math_random_state \* 1664525u \+ 1013904223u;/)
  assert.doesNotMatch(result.code, /value \^= value << 13;/)
})

test('lowers fs.promises readFile, readdir and writeFile to the C fs runtime', () => {
  const result = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const read = fs.promises.readFile('/tmp/value.txt', 'utf8')
  const entries = fs.promises.readdir('/tmp')
  fs.promises.writeFile('/tmp/out.txt', 'saved')
}
`,
    {
      target: 'c'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const read = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'read')

  assert.ok(read)
  assert.equal(read.valueType, 'promise')
  assert.equal(read.promiseValueType, 'string')
  const entries = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'entries')

  assert.ok(entries)
  assert.equal(entries.valueType, 'promise')
  assert.equal(entries.promiseValueType, 'array')
  assert.equal(entries.arrayElementType, 'string')
  assert.deepEqual(result.ir.features, ['async-runtime', 'fs'])
  assert.deepEqual(result.ir.runtimeRequirements, ['async-runtime', 'fs'])
  assert.match(result.code, /#include <string\.h>/)
  assert.match(result.code, /#include "ccjs\/fs\.h"/)
  assert.match(result.code, /ccjs_loop ccjs_loop;/)
  assert.match(result.code, /ccjs_promise \*read = 0;/)
  assert.match(result.code, /ccjs_promise \*entries = 0;/)
  assert.match(result.code, /ccjs_promise \*ccjs_promise_\d+ = 0;/)
  assert.match(
    result.code,
    /if \(ccjs_loop_init\(&ccjs_loop, &ccjs_default_allocator\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_fs_read_file\(&ccjs_loop, "\/tmp\/value\.txt", 14, &read\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /if \(ccjs_fs_read_dir\(&ccjs_loop, "\/tmp", 4, &entries\) != CCJS_OK\)\s+goto ccjs_cleanup;/)
  assert.match(
    result.code,
    /if \(ccjs_fs_write_file\(&ccjs_loop, "\/tmp\/out\.txt", 12, "saved", 5, &ccjs_promise_\d+\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(result.code, /if \(read != 0\) ccjs_promise_release\(read\);/)
  assert.match(result.code, /if \(entries != 0\) ccjs_promise_release\(entries\);/)
  assert.match(result.code, /if \(ccjs_loop_active\) ccjs_loop_dispose\(&ccjs_loop\);/)

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  fs.promises.writeFile('/tmp/out.txt')
}
`,
    'CCJS_ARG_COUNT'
  )

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  fs.promises.readdir('/tmp', 'utf8', 'extra')
}
`,
    'CCJS_ARG_COUNT'
  )

  assertDiagnostic(
    `import fs from 'node:fs'

export function main(): void {
  fs.readFile('/tmp/value.txt', 'utf8')
}
`,
    'CCJS_FS_UNSUPPORTED'
  )
})

test('reports JS stdlib globals with a stable C diagnostic', () => {
  const usages = compileSource(
    `import fs from 'node:fs'

export function main(): void {
  const text = fs.promises.readFile('/tmp/value.txt', 'utf8')
  const parsed = Date.parse('2026-06-09T00:00:00Z')
  const server = http.createServer((request, response) => {
    response.end('ok')
  })
  const promise = Promise.resolve(parsed)
  console.log(text, server, promise)
}
`,
    {
      target: 'js'
    }
  )

  assert.deepEqual([...new Set(usages.ir.globalUsages.map((usage) => usage.root))].sort(), [
    'Date',
    'Promise',
    'fs',
    'http'
  ])
  assert.deepEqual(usages.ir.globalUsages.map((usage) => usage.path.join('.')).sort(), [
    'Date.parse',
    'Promise.resolve',
    'fs.promises.readFile',
    'http.createServer'
  ])

  for (const source of [
    `export function main(): void {
  const parsed = Date.parse('2026-06-09T00:00:00Z')
  console.log(parsed)
}
`,
    `export function main(): void {
  const server = http.createServer((request, response) => {
    response.end('ok')
  })
  console.log(server)
}
`,
    `export function main(): void {
  const promise = Promise.all([])
  console.log(promise)
}
`
  ]) {
    assertDiagnostic(source, 'CCJS_C_JS_GLOBAL', {
      target: 'c'
    })
  }
})

test('reports embedded profile capability diagnostics from IR global usages', () => {
  const source = `import fs from 'node:fs'

function onTimer(): void {
  console.log('timer')
}

export function main(): void {
  const wall = Date.now()
  const monotonic = performance.now()
  const timeout = setTimeout(onTimer, 1)
  fs.promises.writeFile('/private/tmp/ccjs-embedded-profile.txt', 'saved')
  clearTimeout(timeout)
  console.log('ok', wall, monotonic)
}
`

  assert.throws(
    () => {
      compileSource(source, {
        target: 'c',
        profile: 'embedded'
      })
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.every((item) => item.code === 'CCJS_CAPABILITY'),
        true
      )
      assert.deepEqual(
        error.diagnostics.map((item) => item.message),
        [
          'embedded profile requires wall-clock capability for Date.now',
          'embedded profile requires monotonic-clock capability for performance.now',
          'embedded profile requires timers capability for setTimeout',
          'embedded profile requires filesystem capability for fs.promises.writeFile',
          'embedded profile requires timers capability for clearTimeout'
        ]
      )
      return true
    }
  )

  const enabled = compileSource(source, {
    target: 'c',
    profile: 'embedded',
    capabilities: {
      fs: true,
      monotonicClock: true,
      timers: true,
      wallClock: true
    }
  })

  assert.match(enabled.code, /#include "ccjs\/fs\.h"/)
  assert.match(enabled.code, /#include "ccjs\/time\.h"/)
  assert.match(enabled.code, /ccjs_loop_set_timeout/)
})

test('reports embedded entropy capability diagnostics for OS Math.random backend', () => {
  const source = `export function main(): void {
  const value = Math.random()
  console.log(value)
}
`

  assert.throws(
    () => {
      compileSource(source, {
        target: 'c',
        profile: 'embedded',
        random: {
          backend: 'os'
        }
      })
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.every((item) => item.code === 'CCJS_CAPABILITY'),
        true
      )
      assert.deepEqual(
        error.diagnostics.map((item) => item.message),
        ['embedded profile requires entropy capability for Math.random']
      )
      return true
    }
  )

  const enabled = compileSource(source, {
    target: 'c',
    profile: 'embedded',
    capabilities: {
      entropy: true
    },
    random: {
      backend: 'os'
    }
  })

  assert.match(enabled.code, /ccjs_os_random_bytes/)
})

test('reports embedded entropy capability diagnostics for crypto.getRandomValues', () => {
  const source = `export function main(): void {
  const bytes = Buffer.alloc(4)
  crypto.getRandomValues(bytes)
  console.log(bytes.length)
}
`

  assert.throws(
    () => {
      compileSource(source, {
        target: 'c',
        profile: 'embedded'
      })
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.every((item) => item.code === 'CCJS_CAPABILITY'),
        true
      )
      assert.deepEqual(
        error.diagnostics.map((item) => item.message),
        ['embedded profile requires entropy capability for crypto.getRandomValues']
      )
      return true
    }
  )

  const enabled = compileSource(source, {
    target: 'c',
    profile: 'embedded',
    capabilities: {
      entropy: true
    }
  })

  assert.match(enabled.code, /ccjs_crypto_get_random_values/)
})

test('reports embedded heap capability diagnostics for array-producing methods', () => {
  const source = `export function main(): void {
  const values = [1, 2, 3]
  const result = values.filter(value => value > 1).map(value => value + 1)
  console.log(result.length)
}
`

  assert.throws(
    () => {
      compileSource(source, {
        target: 'c',
        profile: 'embedded'
      })
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.every((item) => item.code === 'CCJS_CAPABILITY'),
        true
      )
      assert.deepEqual(
        error.diagnostics.map((item) => item.message),
        [
          'embedded profile requires heap capability for Array.map',
          'embedded profile requires heap capability for Array.filter'
        ]
      )
      return true
    }
  )

  const enabled = compileSource(source, {
    target: 'c',
    profile: 'embedded',
    capabilities: {
      heap: true
    }
  })

  assert.match(enabled.code, /ccjs_array_push\(ccjs_filter_array_\d+, ccjs_filter_value_\d+\)/)
  assert.match(enabled.code, /ccjs_array_push\(ccjs_map_array_\d+, ccjs_number_value/)
})

test('reports C compile budget diagnostics from target-neutral IR metadata', () => {
  const source = `export function main(): void {
  const values = [1, 2, 3]
  console.log(values.length)
}
`

  assert.throws(
    () => {
      compileSource(source, {
        target: 'c',
        budgets: {
          maxFeatures: 0,
          maxRuntimeRequirements: 0
        }
      })
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.deepEqual(
        error.diagnostics.map((item) => item.code),
        ['CCJS_BUDGET', 'CCJS_BUDGET']
      )
      assert.deepEqual(
        error.diagnostics.map((item) => item.message),
        [
          'C target uses 3 IR features (collections, runtime-values, string-bytes), exceeding maxFeatures budget 0',
          'C target uses 3 runtime requirements (collections, managed-values, string-bytes), exceeding maxRuntimeRequirements budget 0'
        ]
      )
      return true
    }
  )

  const result = compileSource(source, {
    target: 'c',
    budgets: {
      maxFeatures: 3,
      maxRuntimeRequirements: 3
    }
  })

  assert.match(result.code, /#include "ccjs\/array\.h"/)
})

test('drives C JS global diagnostics from target-neutral IR global usages', () => {
  const result = compileSource(
    `export function main(): void {
  console.log('ok')
}
`,
    {
      target: 'js'
    }
  )

  assert.deepEqual(result.ir.globalUsages, [])
  assert.deepEqual(
    collectIrGlobalRoots([
      {
        globalUsages: [
          {
            root: 'crypto',
            path: ['crypto']
          }
        ]
      }
    ]),
    ['crypto']
  )
  assert.throws(
    () =>
      emitCFromIr({
        ...result.ir,
        globalUsages: [
          {
            root: 'crypto',
            path: ['crypto'],
            loc: {
              line: 1,
              column: 1
            }
          }
        ]
      }),
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(error.diagnostics[0]?.code, 'CCJS_C_JS_GLOBAL')
      return true
    }
  )
})

test('drives C function return object shapes from target-neutral IR declarations', () => {
  const result = compileSource(
    `type User = {
  readonly id: number,
  name: string
}

function getUser(): User {
  return { id: 7, name: 'Ada' }
}

export function main(): void {
  console.log('ok')
}
`,
    {
      target: 'c'
    }
  )
  const getUser = result.ir.functionDeclarations.find((item) => item.name === 'getUser')

  assert.deepEqual(
    getUser?.returnShape?.fields.map((field) => ({
      name: field.name,
      readonly: field.readonly
    })),
    [
      {
        name: 'id',
        readonly: true
      },
      {
        name: 'name',
        readonly: false
      }
    ]
  )
  assert.equal((result.code.match(/CCJS_FIELD_READONLY/g) ?? []).length, 1)

  const withoutReturnShape = emitCFromIr({
    ...result.ir,
    functionDeclarations: result.ir.functionDeclarations.map((item) =>
      item.name === 'getUser'
        ? {
            ...item,
            returnShape: undefined
          }
        : item
    )
  })

  assert.equal((withoutReturnShape.match(/CCJS_FIELD_READONLY/g) ?? []).length, 0)
})

test('module graph stores HIR and IR per module', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-modules-'))

  try {
    await writeFile(
      join(dir, 'lib.js'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.js'),
      `import { greet } from './lib.js'

export function main(): void {
  greet()
}
`
    )

    const result = await compileFile(join(dir, 'main.js'), {
      target: 'js'
    })

    assert.equal(
      result.graph.modules.every((module) => module.hir?.type === 'HirProgram'),
      true
    )
    assert.equal(
      result.graph.modules.every((module) => module.ir?.type === 'IrProgram'),
      true
    )
    assert.equal(
      result.graph.modules.every((module) => Array.isArray(module.ir?.topLevelItems)),
      true
    )
    assert.equal(
      result.graph.modules.every((module) => Array.isArray(module.ir?.functionDeclarations)),
      true
    )
    assert.equal(
      result.graph.modules.every((module) => Array.isArray(module.ir?.syntaxFeatures)),
      true
    )
    assert.equal(
      result.graph.modules.every((module) => Array.isArray(module.ir?.globalUsages)),
      true
    )
    assert.equal(
      result.graph.modules.every((module) => Array.isArray(module.ir?.functionEffects)),
      true
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('collects target-neutral IR module records from stored IR without HIR', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-ir-module-records-'))

  try {
    await writeFile(
      join(dir, 'lib.ts'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet } from './lib.ts'

export function main(): void {
  greet()
}
`
    )

    const result = await compileFile(join(dir, 'main.ts'), {
      target: 'js'
    })
    const graph = {
      ...result.graph,
      modules: result.graph.modules.map((module) => ({
        ...module,
        hir: null
      }))
    }
    const irModules = collectIrModuleRecords(graph)

    assert.equal(irModules.length, result.graph.modules.length)
    assert.deepEqual(
      irModules.map((module) => module.path),
      result.graph.modules.map((module) => module.path)
    )
    assert.deepEqual(
      irModules.flatMap((module) => module.ir.functionDeclarations.map((item) => item.name)),
      ['greet', 'main']
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('does not rebuild IR module records from legacy HIR fallback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-ir-module-no-hir-fallback-'))

  try {
    await writeFile(
      join(dir, 'lib.ts'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet } from './lib.ts'

export function main(): void {
  greet()
}
`
    )

    const result = await compileFile(join(dir, 'main.ts'), {
      target: 'js'
    })
    const graph = {
      ...result.graph,
      modules: result.graph.modules.map((module, index) =>
        index === 0
          ? {
              ...module,
              ir: null
            }
          : module
      )
    }
    const irModules = collectIrModuleRecords(graph)

    assert.equal(irModules.length, result.graph.modules.length - 1)
    assert.deepEqual(
      irModules.map((module) => module.path),
      result.graph.modules.slice(1).map((module) => module.path)
    )
    assert.deepEqual(
      irModules.flatMap((module) => module.ir.functionDeclarations.map((item) => item.name)),
      ['main']
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('emits JS and C bundles directly from target-neutral IR module records', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-bundle-ir-entrypoints-'))

  try {
    await writeFile(
      join(dir, 'lib.ts'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet } from './lib.ts'

export function main(): void {
  greet()
}
`
    )

    const result = await compileFile(join(dir, 'main.ts'), {
      target: 'js',
      callMain: false
    })
    const irModules = collectIrModuleRecords(result.graph)
    const libEntry =
      irModules.find((module) => module.ir.functionDeclarations.some((item) => item.name === 'greet'))?.path ?? ''
    assert.notEqual(libEntry, '')
    const js = emitJsBundleFromIrModules(irModules, result.graph.entry, {
      callMain: false
    })
    const c = emitCBundleFromIrModules(irModules, result.graph.entry)
    const jsWithLibEntry = emitJsBundleFromIrModules(irModules, libEntry)
    const cWithLibEntry = emitCBundleFromIrModules(irModules, libEntry)

    assert.deepEqual(
      collectIrPrograms(irModules),
      irModules.map((module) => module.ir)
    )
    assert.equal(
      findIrEntryProgram(irModules, result.graph.entry)?.functionDeclarations.some((item) => item.name === 'main'),
      true
    )
    assert.equal(
      findIrEntryProgram(irModules, libEntry)?.functionDeclarations.some((item) => item.name === 'greet'),
      true
    )
    assert.match(js, /function greet\(\) \{/)
    assert.match(js, /function main\(\) \{/)
    assert.doesNotMatch(js, /const ccjsMainResult/)
    assert.match(c, /void greet\(void\);/)
    assert.match(c, /void ccjs_main\(void\);/)
    assert.doesNotMatch(c, /int main\(void\) \{[\s\S]*ccjs_main\(\);/)
    assert.doesNotMatch(jsWithLibEntry, /const ccjsMainResult = main\(\)/)
    assert.doesNotMatch(cWithLibEntry, /int main\(void\) \{\n {2}ccjs_main\(\);/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('drives JS bundle body and main wrapper from stored target-neutral IR programs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-js-bundle-ir-'))

  try {
    await writeFile(
      join(dir, 'lib.ts'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet } from './lib.ts'

export function main(): void {
  greet()
}
`
    )

    const result = await compileFile(join(dir, 'main.ts'), {
      target: 'js'
    })
    const graph = {
      ...result.graph,
      modules: result.graph.modules.map((module) => ({
        ...module,
        hir: null
      }))
    }
    const code = emitJsBundleFromIrModules(collectIrModuleRecords(graph), graph.entry)

    assert.match(code, /function greet\(\)/)
    assert.match(code, /function main\(\)/)
    assert.match(code, /const ccjsMainResult = main\(\)/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('drives C bundle functions and main wrapper from stored target-neutral IR programs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-bundle-ir-'))

  try {
    await writeFile(
      join(dir, 'lib.ts'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet } from './lib.ts'

greet()
`
    )

    const result = await compileFile(join(dir, 'main.ts'), {
      target: 'c'
    })
    const graph = {
      ...result.graph,
      modules: result.graph.modules.map((module) => ({
        ...module,
        hir: null
      }))
    }
    const code = emitCBundleFromIrModules(collectIrModuleRecords(graph), graph.entry)

    assert.match(code, /void greet\(void\);/)
    assert.match(code, /void greet\(void\) \{/)
    assert.doesNotMatch(code, /ccjs_main/)
    assert.match(code, /int main\(void\) \{\n {2}double ccjs_return = 0;\n {2}greet\(\);/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('compiles static ESM import aliases to JS and C bundles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-module-aliases-'))

  try {
    await writeFile(
      join(dir, 'lib.ts'),
      `export function greet(): void {
  console.log('from alias')
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet as sayHello } from './lib.ts'

export function main(): void {
  sayHello()
}
`
    )

    const js = await compileFile(join(dir, 'main.ts'), {
      target: 'js'
    })
    const c = await compileFile(join(dir, 'main.ts'), {
      target: 'c'
    })

    assert.match(js.code, /function sayHello\(\) \{\n {2}greet\(\)\n}/)
    assert.match(c.code, /void sayHello\(void\);/)
    assert.match(c.code, /void sayHello\(void\) \{\n {2}greet\(\);/)
    assert.match(c.code, /ccjs_main\(void\) \{\n {2}sayHello\(\);/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('compiles static ESM type imports before checking modules', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-module-type-imports-'))

  try {
    await writeFile(
      join(dir, 'types.ts'),
      `export type User = {
  readonly name: string
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import type { User as Person } from './types.ts'

export function main(): void {
  const user: Person = { name: 'Ada' }
  console.log(user.name)
}
`
    )

    const js = await compileFile(join(dir, 'main.ts'), {
      target: 'js'
    })
    const c = await compileFile(join(dir, 'main.ts'), {
      target: 'c'
    })

    assert.match(js.code, /const user = \{ name: "Ada" \}/)
    assert.match(c.code, /static const ccjs_field_info ccjs_shape_user_\d+_fields\[\]/)
    assert.match(c.code, /ccjs_object_get_known\(user, 0, &ccjs_log_value_\d+\)/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('resolves static ESM directory index imports', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-module-index-imports-'))

  try {
    await mkdir(join(dir, 'lib'))
    await writeFile(
      join(dir, 'lib', 'index.ts'),
      `export function greet(): void {
  console.log('from index')
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet } from './lib'

export function main(): void {
  greet()
}
`
    )

    const js = await compileFile(join(dir, 'main.ts'), {
      target: 'js'
    })
    const c = await compileFile(join(dir, 'main.ts'), {
      target: 'c'
    })

    assert.equal(
      js.graph.modules.some((module) => module.path.endsWith('/lib/index.ts')),
      true
    )
    assert.match(js.code, /from index/)
    assert.match(c.code, /void greet\(void\);/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('accepts valid TypeScript source files as canonical input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-ts-modules-'))

  try {
    await writeFile(
      join(dir, 'lib.ts'),
      `export function greet(): string {
  return 'from ts'
}
`
    )
    await writeFile(
      join(dir, 'main.ts'),
      `import { greet } from './lib.ts'

export function main(): void {
  console.log(greet())
}
`
    )

    const result = await compileFile(join(dir, 'main.ts'), {
      target: 'js'
    })

    assert.match(result.code, /from ts/)
    assert.equal(
      result.graph.modules.every((module) => module.path.endsWith('.ts')),
      true
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('rejects duplicate declarations in the same scope', () => {
  assertDiagnostic(
    `export function main(): void {
  const value = 1
  const value = 2
}
`,
    'CCJS_REDECLARED_NAME'
  )
})

test('rejects use before declaration in the current compiler slice', () => {
  assertDiagnostic(
    `export function main(): void {
  console.log(value)
  const value = 1
}
`,
    'CCJS_UNKNOWN_NAME'
  )
})

test('rejects assignment to const bindings', () => {
  assertDiagnostic(
    `export function main(): void {
  const value = 1
  value = 2
}
`,
    'CCJS_ASSIGN_CONST'
  )
})

test('rejects unknown names', () => {
  assertDiagnostic(
    `export function main(): void {
  console.log(missing)
}
`,
    'CCJS_UNKNOWN_NAME'
  )
})

test('rejects variable type mismatches', () => {
  assertDiagnostic(
    `export function main(): void {
  const value: number = 'Ada'
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('rejects equality type mismatches', () => {
  assertDiagnostic(
    `export function main(): void {
  const same = 1 === '1'
  console.log(same)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const same = 1 == '1'
  console.log(same)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('rejects function argument type mismatches', () => {
  assertDiagnostic(
    `function greet(name: string): void {
  console.log(name)
}

export function main(): void {
  greet(1)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('rejects function argument count mismatches', () => {
  assertDiagnostic(
    `function greet(name: string): void {
  console.log(name)
}

export function main(): void {
  greet()
}
`,
    'CCJS_ARG_COUNT'
  )
})

test('rejects return type mismatches', () => {
  assertDiagnostic(
    `function getValue(): number {
  return 'Ada'
}

export function main(): void {
  console.log(getValue())
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('checks string length as a readonly number field', () => {
  const result = compileSource(
    `function length(name: string): number {
  return name.length
}

export function main(): void {
  const name = 'Ada'
  console.log(length(name))
}
`,
    {
      target: 'js'
    }
  )

  assert.match(result.code, /function ccjsStringLength\(value\) \{/)
  assert.match(result.code, /return ccjsStringLength\(name\)/)

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.length = 4
}
`,
    'CCJS_ASSIGN_READONLY_FIELD'
  )
})

test('checks array length as a readonly number field', () => {
  const result = compileSource(
    `function length(values: number[]): number {
  return values.length
}

export function main(): void {
  const values = [1, 2, 3]
  console.log(length(values))
}
`,
    {
      target: 'js'
    }
  )

  assert.match(result.code, /return values\.length/)

  assertDiagnostic(
    `export function main(): void {
  const values = [1, 2, 3]
  values.length = 4
}
`,
    'CCJS_ASSIGN_READONLY_FIELD'
  )
})

test('keeps array element types for T[] and Array<T>', () => {
  const result = compileSource(
    `function firstNumber(values: number[]): number {
  return values[0]
}

function firstName(values: Array<string>): string {
  return values[0]
}

export function main(): void {
  const values: number[] = [1, 2, 3]
  const names: Array<string> = ['Ada']
  console.log(firstNumber(values), firstName(names))
}
`,
    {
      target: 'js'
    }
  )
  const firstNumber = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'firstNumber')
  const firstName = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'firstName')
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(firstNumber)
  assert.ok(firstName)
  assert.ok(main)
  const [values, names] = main.body.filter((item) => item.type === 'VariableDeclaration')

  assert.equal(firstNumber.params[0].valueType, 'array')
  assert.equal(firstNumber.params[0].arrayElementType, 'number')
  assert.equal(firstName.params[0].valueType, 'array')
  assert.equal(firstName.params[0].arrayElementType, 'string')
  assert.equal(values.valueType, 'array')
  assert.equal(values.arrayElementType, 'number')
  assert.equal(names.valueType, 'array')
  assert.equal(names.arrayElementType, 'string')
  assert.match(result.code, /return values\[0\]/)

  assertDiagnostic(
    `function first(values: number[]): string {
  return values[0]
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const values: number[] = ['Ada']
  console.log(values.length)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('checks Array sort filter map as typed chain calls', () => {
  const result = compileSource(
    `export function main(): void {
  const values: number[] = [3, 1, 2]
  const result = values.sort((left, right) => left - right).filter((value, index) => value > index).map(value => value + 1)
  console.log(result.length)
}
`,
    {
      target: 'js'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)
  const resultDeclaration = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'result')
  assert.ok(resultDeclaration)
  const sortCall = resultDeclaration.init.callee.object.callee.object
  const filterCall = resultDeclaration.init.callee.object
  const mapCall = resultDeclaration.init

  assert.equal(resultDeclaration.valueType, 'array')
  assert.equal(resultDeclaration.arrayElementType, 'number')
  assert.equal(sortCall.args[0].params[0].valueType, 'number')
  assert.equal(sortCall.args[0].params[1].valueType, 'number')
  assert.equal(filterCall.args[0].params[0].valueType, 'number')
  assert.equal(filterCall.args[0].params[1].valueType, 'number')
  assert.equal(mapCall.args[0].params[0].valueType, 'number')
  assert.match(
    result.code,
    /\.sort\(\(left, right\) => \(left - right\)\)\.filter\(\(value, index\) => \(value > index\)\)\.map\(value => \(value \+ 1\)\)/
  )

  const mapped = compileSource(
    `export function main(): void {
  const values: number[] = [1]
  const names = values.map(value => String(value))
  console.log(names[0])
}
`,
    {
      target: 'js'
    }
  )
  const mappedMain = mapped.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(mappedMain)
  const names = mappedMain.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'names')
  assert.ok(names)

  assert.equal(names.valueType, 'array')
  assert.equal(names.arrayElementType, 'string')

  const c = compileSource(
    `export function main(): void {
  const values = [3, 1, 2]
  const result = values
    .sort((left, right) => {
      return left - right
    })
    .filter((value, index) => {
      return value > index
    })
    .map(value => {
      return value + 1
    })

  console.log(result.length)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(c.code, /ccjs_sort_compare_\d+ = \(left - right\);/)
  assert.match(c.code, /if \(value > index\) \{/)
  assert.match(c.code, /ccjs_array_push\(ccjs_map_array_\d+, ccjs_number_value\(\(value \+ 1\)\)\)/)

  const branchedC = compileSource(
    `export function main(): void {
  const values = [1, 2, 3]
  const result = values
    .filter(value => {
      if (value > 1) {
        return true
      } else {
        return false
      }
    })
    .map(value => {
      if (value === 2) {
        return value * 10
      }

      return value + 10
    })

  console.log(result.length)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(branchedC.code, /ccjs_array_callback_done_\d+:;/)
  assert.match(branchedC.code, /if \(1\) \{[\s\S]*ccjs_array_push\(ccjs_filter_array_\d+, ccjs_filter_value_\d+\)/)
  assert.match(branchedC.code, /ccjs_array_push\(ccjs_map_array_\d+, ccjs_number_value\(\(value \* 10\)\)\)/)
  assert.match(branchedC.code, /ccjs_array_push\(ccjs_map_array_\d+, ccjs_number_value\(\(value \+ 10\)\)\)/)

  const multiStatementFilter = compileSource(
    `export function main(): void {
  const values: number[] = [1, 2]
  const result = values.filter(value => {
    const keep = value > 1

    return keep
  })

  console.log(result.length)
}
`,
    {
      target: 'js'
    }
  )

  assert.match(multiStatementFilter.code, /const result = values\.filter\(value => \{/)

  assertDiagnostic(
    `export function main(): void {
  const values: number[] = [1]
  values.filter(value => value + 1)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const values: number[] = [1]
  values.sort((left: string, right: string) => 0)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('checks Array push as a typed mutating call', () => {
  const result = compileSource(
    `export function main(): void {
  const values: number[] = [1]
  const length = values.push(2)
  console.log(length, values.length)
}
`,
    {
      target: 'js'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)
  const length = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'length')
  assert.ok(length)

  assert.equal(length.valueType, 'number')
  assert.equal(length.init.valueType, 'number')
  assert.equal(length.init.args[0].valueType, 'number')
  assert.match(result.code, /const length = values\.push\(2\)/)

  assertDiagnostic(
    `export function main(): void {
  const values: number[] = [1]
  values.push('Ada')
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const values: number[] = [1]
  values.push()
}
`,
    'CCJS_ARG_COUNT'
  )
})

test('checks Array pop as a nullable typed mutating call', () => {
  const result = compileSource(
    `export function main(): void {
  const values: number[] = [1]
  const value = values.pop()
  const fallback = values.pop() ?? 0
  console.log(value, fallback)
}
`,
    {
      target: 'js'
    }
  )
  const js = compileSource(
    `export function main(): void {
  const names: string[] = ['Ada']
  const name: string | null = names.pop()
  console.log(name ?? 'missing')
}
`,
    {
      target: 'js'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)
  const value = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'value')
  assert.ok(value)

  assert.equal(value.valueType, 'number')
  assert.equal(value.nullable, true)
  assert.equal(value.init.valueType, 'number')
  assert.equal(value.init.nullable, true)
  assert.deepEqual(result.ir.features, ['array-pop-null', 'collections', 'runtime-values'])
  assert.deepEqual(result.ir.runtimeRequirements, ['collections', 'managed-values'])
  assert.match(result.code, /function ccjsArrayPop\(array\) \{/)
  assert.match(result.code, /const value = ccjsArrayPop\(values\)/)
  assert.match(result.code, /const fallback = \(ccjsArrayPop\(values\) \?\? 0\)/)
  assert.match(js.code, /function ccjsArrayPop\(array\) \{/)
  assert.match(js.code, /const name = ccjsArrayPop\(names\)/)

  assertDiagnostic(
    `export function main(): void {
  const values: number[] = [1]
  const value: number = values.pop()
  console.log(value)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const values: number[] = [1]
  values.pop(1)
}
`,
    'CCJS_ARG_COUNT'
  )
})

test('checks Map and Set generic methods as typed chain calls', () => {
  const result = compileSource(
    `function makeScores(): Map<string, number> {
  return new Map()
}

function makeNames(): Set<string> {
  return new Set()
}

export function main(): void {
  const scores = makeScores()
  const maybeScore = scores.set('Ada', 7).get('Ada')
  const score = maybeScore ?? 0
  const hasAda = scores.has('Ada')
  const removed = scores.delete('Ada')
  const clearedScores = scores.clear()
  const names = makeNames()
  const hasName = names.add('Ada').has('Ada')
  const clearedNames = names.clear()
  console.log(score, hasAda, removed, clearedScores, hasName, clearedNames, scores.size, names.size)
}
`,
    {
      target: 'js'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const js = compileSource(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  const maybeScore: number | null = scores.get('Ada')
  console.log(maybeScore ?? 0)
}
`,
    {
      target: 'js'
    }
  )
  assert.ok(main)
  const scores = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'scores')
  const maybeScore = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'maybeScore')
  const score = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'score')
  const hasAda = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'hasAda')
  const removed = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'removed')
  const clearedScores = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'clearedScores')
  const names = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'names')
  const hasName = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'hasName')
  const clearedNames = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'clearedNames')
  assert.ok(scores)
  assert.ok(maybeScore)
  assert.ok(score)
  assert.ok(hasAda)
  assert.ok(removed)
  assert.ok(clearedScores)
  assert.ok(names)
  assert.ok(hasName)
  assert.ok(clearedNames)

  assert.equal(scores.valueType, 'map')
  assert.equal(scores.mapKeyType, 'string')
  assert.equal(scores.mapValueType, 'number')
  assert.equal(maybeScore.valueType, 'number')
  assert.equal(maybeScore.nullable, true)
  assert.equal(score.valueType, 'number')
  assert.equal(hasAda.valueType, 'boolean')
  assert.equal(removed.valueType, 'boolean')
  assert.equal(clearedScores.valueType, 'void')
  assert.equal(names.valueType, 'set')
  assert.equal(names.setElementType, 'string')
  assert.equal(hasName.valueType, 'boolean')
  assert.equal(clearedNames.valueType, 'void')
  assert.deepEqual(result.ir.features, ['collections', 'map-get-null', 'runtime-values'])
  assert.deepEqual(result.ir.runtimeRequirements, ['collections', 'managed-values'])
  assert.match(result.code, /function ccjsMapGet\(map, key\) \{/)
  assert.match(result.code, /const maybeScore = ccjsMapGet\(scores\.set\("Ada", 7\), "Ada"\)/)
  assert.match(js.code, /function ccjsMapGet\(map, key\) \{/)
  assert.match(js.code, /const maybeScore = ccjsMapGet\(scores, "Ada"\)/)
  assert.match(result.code, /\.add\("Ada"\)\.has\("Ada"\)/)
  assert.match(result.code, /const clearedScores = scores\.clear\(\)/)
  assert.match(result.code, /const clearedNames = names\.clear\(\)/)

  assertDiagnostic(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  const score: number = scores.get('Ada')
  console.log(score)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  scores.get(1)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  scores.set('Ada', '7')
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const names: Set<string> = new Set()
  names.add(1)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  scores.size = 1
}
`,
    'CCJS_ASSIGN_READONLY_FIELD'
  )

  assertDiagnostic(
    `export function main(): void {
  const scores: Map<string, number> = new Map()
  scores.clear('Ada')
}
`,
    'CCJS_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  const names: Set<string> = new Set()
  names.clear('Ada')
}
`,
    'CCJS_ARG_COUNT'
  )

  assertDiagnostic(
    `type User = {
  name: string
}

export function main(): void {
  const users: Map<User, number> = new Map()
  console.log(users.size)
}
`,
    'CCJS_C_COLLECTION',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `type User = {
  name: string
}

export function main(): void {
  const users: Set<User> = new Set()
  const user: User = { name: 'Ada' }
  users.add(user)
}
`,
    'CCJS_C_COLLECTION',
    {
      target: 'c'
    }
  )
})

test('tracks Promise generic metadata through checker and IR', () => {
  const result = compileSource(
    `function makeValue(): Promise<number> {
  return Promise.resolve(7)
}

export function main(): void {
  const value: Promise<number> = Promise.resolve(1)
  const inferred = Promise.resolve('ok')
  console.log(value, inferred)
}
`,
    {
      target: 'js'
    }
  )
  const makeValue = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'makeValue')
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const value = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'value')
  const inferred = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'inferred')
  const makeValueDeclaration = result.ir.functionDeclarations.find((item) => item.name === 'makeValue')

  assert.ok(makeValue)
  assert.ok(value)
  assert.ok(inferred)
  assert.equal(makeValue.returnType, 'promise')
  assert.equal(makeValue.returnPromiseValueType, 'number')
  assert.equal(makeValueDeclaration?.returnPromiseValueType, 'number')
  assert.equal(value.valueType, 'promise')
  assert.equal(value.promiseValueType, 'number')
  assert.equal(inferred.valueType, 'promise')
  assert.equal(inferred.promiseValueType, 'string')
  assert.deepEqual(result.ir.features, ['async-runtime'])
  assert.deepEqual(result.ir.runtimeRequirements, ['async-runtime'])
  assert.match(result.code, /function makeValue\(\) \{/)
  assert.match(result.code, /const value = Promise\.resolve\(1\)/)
  assert.match(result.code, /const inferred = Promise\.resolve\("ok"\)/)

  assertDiagnostic(
    `export function main(): void {
  const value: Promise<number> = Promise.resolve('nope')
  console.log(value)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('tracks Promise constructor generic metadata through checker and IR', () => {
  const result = compileSource(
    `function makeText(): Promise<string> {
  return new Promise((resolve) => {
    const prefix = 'ok'
    resolve(\`\${prefix} \${String(7)}\`)
  })
}

export async function main(): Promise<void> {
  const value = await makeText()
  console.log(value)
}
`,
    {
      target: 'js'
    }
  )
  const makeText = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'makeText')
  const returnStatement = makeText?.body.find((item) => item.type === 'ReturnStatement')
  const makeTextDeclaration = result.ir.functionDeclarations.find((item) => item.name === 'makeText')

  assert.ok(returnStatement)
  assert.equal(returnStatement.argument.valueType, 'promise')
  assert.equal(returnStatement.argument.promiseValueType, 'string')
  assert.equal(makeTextDeclaration?.returnType, 'promise')
  assert.equal(makeTextDeclaration?.returnPromiseValueType, 'string')
  assert.match(result.code, /return new Promise\(resolve => \{/)

  assertDiagnostic(
    `export function main(): void {
  const value: Promise<number> = new Promise((resolve) => {
    resolve('nope')
  })
  console.log(value)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('lowers Promise constructor timer resolves and template update placeholders to C', () => {
  const result = compileSource(
    `function makeText(): Promise<string> {
  return new Promise((resolve) => {
    const prefix = 'ready'
    const count = 7

    setTimeout(() => {
      resolve(\`\${prefix} \${String(count)}\`)
    }, 1)
  })
}

const text = await makeText()
let i = 0
console.log(text, \`interval \${++i}\`)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /ccjs_promise \*resolve;/)
  assert.match(result.code, /ccjs_promise_retain\(ccjs_callback_ctx_\d+->resolve\);/)
  assert.match(result.code, /ccjs_promise_resolve\(resolve, ccjs_value_\d+\)/)
  assert.match(result.code, /ccjs_loop_poll\(&ccjs_loop, ccjs_performance_now\(\)\)/)
  assert.match(result.code, /ccjs_string_from_number\(&ccjs_default_allocator, \(\+\+i\), &ccjs_value_\d+\)/)
})

test('checks Promise then catch as typed chain calls', () => {
  const result = compileSource(
    `export function main(): void {
  const source: Promise<number> = Promise.resolve(2)
  const doubled = source.then(value => value * 2)
  const failed: Promise<string> = Promise.reject(new Error('bad'))
  const recovered = failed.catch(error => 'ok')
  const chained = source
    .then(value => value + 1)
    .catch(error => 0)
    .then(value => String(value))

  console.log(doubled, recovered, chained)
}
`,
    {
      target: 'js'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const doubled = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'doubled')
  const recovered = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'recovered')
  const chained = main?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'chained')
  const thenCallback = doubled?.init.args[0]
  const catchCallback = recovered?.init.args[0]

  assert.equal(doubled?.valueType, 'promise')
  assert.equal(doubled?.promiseValueType, 'number')
  assert.equal(thenCallback?.params[0].valueType, 'number')
  assert.equal(thenCallback?.returnType, 'number')
  assert.equal(recovered?.valueType, 'promise')
  assert.equal(recovered?.promiseValueType, 'string')
  assert.equal(catchCallback?.params[0].valueType, 'unknown')
  assert.equal(catchCallback?.returnType, 'string')
  assert.equal(chained?.valueType, 'promise')
  assert.equal(chained?.promiseValueType, 'string')
  assert.equal(result.ir.features.includes('async-runtime'), true)
  assert.match(result.code, /const doubled = source\.then\(value => \(value \* 2\)\)/)
  assert.match(result.code, /const recovered = failed\.catch\(error => "ok"\)/)
  assert.match(
    result.code,
    /const chained = source\.then\(value => \(value \+ 1\)\)\.catch\(error => 0\)\.then\(value => String\(value\)\)/
  )

  const multiStatement = compileSource(
    `export function main(): void {
  const promise = Promise.resolve(1).then(value => {
    const doubled = value * 2

    return doubled
  })

  console.log(promise)
}
`,
    {
      target: 'js'
    }
  )
  const multiMain = multiStatement.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  const multiPromise = multiMain?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'promise')

  assert.equal(multiPromise?.promiseValueType, 'number')
  assert.match(multiStatement.code, /const promise = Promise\.resolve\(1\)\.then\(value => \{/)

  const branchStatement = compileSource(
    `export function main(): void {
  const promise = Promise.resolve(1).then(value => {
    if (value > 0) {
      return value
    }

    return 0
  })

  console.log(promise)
}
`,
    {
      target: 'js'
    }
  )
  const branchMain = branchStatement.hir.body.find(
    (item) => item.type === 'FunctionDeclaration' && item.name === 'main'
  )
  const branchPromise = branchMain?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'promise')

  assert.equal(branchPromise?.promiseValueType, 'number')
  assert.match(branchStatement.code, /const promise = Promise\.resolve\(1\)\.then\(value => \{/)

  const switchStatement = compileSource(
    `export function main(): void {
  const promise = Promise.resolve(2).then(value => {
    switch (value) {
      case 2:
        return value
      default:
        return 0
    }

    return 1
  })

  console.log(promise)
}
`,
    {
      target: 'js'
    }
  )
  const switchMain = switchStatement.hir.body.find(
    (item) => item.type === 'FunctionDeclaration' && item.name === 'main'
  )
  const switchPromise = switchMain?.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'promise')

  assert.equal(switchPromise?.promiseValueType, 'number')
  assert.match(switchStatement.code, /const promise = Promise\.resolve\(2\)\.then\(value => \{/)

  assertDiagnostic(
    `export function main(): void {
  const source: Promise<number> = Promise.resolve(2)
  source.then((value: string) => value)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
  assertDiagnostic(
    `export function main(): void {
  const failed: Promise<string> = Promise.reject(new Error('bad'))
  failed.catch(error => 1)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
  assertDiagnostic(
    `export function main(): void {
  const promise = Promise.resolve(1).then(value => {
    while (value > 0) {
      return value
    }

    return 0
  })
  console.log(promise)
}
`,
    'CCJS_C_ASYNC',
    {
      target: 'c'
    }
  )
})

test('lowers Promise then catch chains to C runtime promises', () => {
  const result = compileSource(
    `export async function main(): Promise<void> {
  const doubled = Promise.resolve(4).then(value => value * 2)
  const blockDoubled = Promise.resolve(5).then(value => {
    return value * 3
  })
  const multiDoubled = Promise.resolve(6).then(value => {
    const doubled = value * 2

    return doubled
  })
  const branchDoubled = Promise.resolve(7).then(value => {
    if (value > 5) {
      return value * 2
    }

    return value
  })
  const switchDoubled = Promise.resolve(2).then(value => {
    switch (value) {
      case 2:
        return value * 10
      default:
        return 0
    }

    return value
  })
  const failed: Promise<number> = Promise.reject('fail')
  const recovered = failed.catch(error => 95)
  const blockRecovered = failed.catch(error => {
    return 96
  })
  const multiRecovered = failed.catch(error => {
    const recovered = 97

    return recovered
  })
  const branchRecovered = failed.catch(error => {
    if (1 === 1) {
      return 98
    }

    return 0
  })

  console.log(await doubled, await blockDoubled, await multiDoubled, await branchDoubled, await switchDoubled, await recovered, await blockRecovered, await multiRecovered, await branchRecovered)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_promise_chain_arrow_\d+\(void \*context, ccjs_value ccjs_value_input, ccjs_value \*out\);/
  )
  assert.match(
    result.code,
    /static ccjs_status ccjs_promise_chain_arrow_\d+\(void \*context, ccjs_value ccjs_value_input, ccjs_value \*out\) \{\n {2}\(void\)context;\n {2}if \(out == 0\) return CCJS_ERR_TYPE;\n {2}\*out = ccjs_undefined_value\(\);\n {2}if \(ccjs_value_input\.tag != CCJS_TAG_NUMBER\) return CCJS_ERR_TYPE;\n {2}double value = ccjs_value_input\.as\.number;/
  )
  assert.match(result.code, /\*out = ccjs_number_value\(\(value \* 2\)\);/)
  assert.match(result.code, /\*out = ccjs_number_value\(\(value \* 3\)\);/)
  assert.match(result.code, /const double doubled = \(value \* 2\);/)
  assert.match(result.code, /\*out = ccjs_number_value\(doubled\);/)
  assert.match(
    result.code,
    /if \(value > 5\) \{\n {4}\(\*out\) = ccjs_number_value\(\(value \* 2\)\);\n {4}goto ccjs_promise_callback_cleanup;\n {2}\}/
  )
  assert.match(
    result.code,
    /\(\*out\) = ccjs_number_value\(value\);\n {2}goto ccjs_promise_callback_cleanup;\nccjs_promise_callback_cleanup:/
  )
  assert.match(
    result.code,
    /switch \(\(int\)value\) \{\n {4}case \(int\)2: \{\n {6}\(\*out\) = ccjs_number_value\(\(value \* 10\)\);\n {6}goto ccjs_promise_callback_cleanup;/
  )
  assert.match(result.code, /\*out = ccjs_number_value\(96\);/)
  assert.match(result.code, /const double recovered = 97;/)
  assert.match(result.code, /\*out = ccjs_number_value\(recovered\);/)
  assert.match(
    result.code,
    /if \(1 == 1\) \{\n {4}\(\*out\) = ccjs_number_value\(98\);\n {4}goto ccjs_promise_callback_cleanup;\n {2}\}/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_chain\(ccjs_promise_\d+, ccjs_promise_chain_arrow_\d+, 0, 0, 0, &doubled\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_chain\(ccjs_promise_\d+, ccjs_promise_chain_arrow_\d+, 0, 0, 0, &blockDoubled\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_chain\(ccjs_promise_\d+, ccjs_promise_chain_arrow_\d+, 0, 0, 0, &multiDoubled\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_chain\(ccjs_promise_\d+, ccjs_promise_chain_arrow_\d+, 0, 0, 0, &branchDoubled\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_chain\(ccjs_promise_\d+, ccjs_promise_chain_arrow_\d+, 0, 0, 0, &switchDoubled\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_catch\(failed, ccjs_promise_chain_arrow_\d+, 0, 0, &recovered\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_catch\(failed, ccjs_promise_chain_arrow_\d+, 0, 0, &blockRecovered\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_catch\(failed, ccjs_promise_chain_arrow_\d+, 0, 0, &multiRecovered\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_catch\(failed, ccjs_promise_chain_arrow_\d+, 0, 0, &branchRecovered\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /while \(ccjs_promise_get_state\(doubled\) == CCJS_PROMISE_PENDING && ccjs_loop_has_work\(&ccjs_loop\)\) \{/
  )
  assert.match(
    result.code,
    /while \(ccjs_promise_get_state\(blockDoubled\) == CCJS_PROMISE_PENDING && ccjs_loop_has_work\(&ccjs_loop\)\) \{/
  )
  assert.match(
    result.code,
    /while \(ccjs_promise_get_state\(recovered\) == CCJS_PROMISE_PENDING && ccjs_loop_has_work\(&ccjs_loop\)\) \{/
  )
})

test('lowers Promise callback loop bodies to C runtime promises', () => {
  const result = compileSource(
    `export async function main(): Promise<void> {
  const whileTotal = Promise.resolve(3).then(value => {
    let total = 0

    while (value > 0) {
      total = total + value
      value = value - 1
    }

    return total
  })
  const forTotal = Promise.resolve(4).then(value => {
    let total = 0

    for (let index = 0; index < value; index = index + 1) {
      if (index === 2) {
        continue
      }

      total = total + index
    }

    return total
  })

  console.log(await whileTotal, await forTotal)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /while \(value > 0\) \{/)
  assert.match(result.code, /for \(double index = 0; \(index < value\); \(index = \(index \+ 1\)\)\) \{/)
  assert.match(result.code, /goto ccjs_continue_\d+;/)
  assert.match(result.code, /\(\*out\) = ccjs_number_value\(total\);\n {2}goto ccjs_promise_callback_cleanup;/)
})

test('lowers captured Promise callbacks to C runtime promises', () => {
  const result = compileSource(
    `type User = {
  name: string
}

export async function main(): Promise<void> {
  const extra = 3
  const ok = true
  const literal = 'literal'
  const user: User = { name: 'captured' }
  const label = user.name
  const raw = Promise.resolve(1).then(value => {
    console.log(literal)

    return value + extra
  })
  const added = Promise.resolve(4).then(value => value + extra)
  const logged = Promise.resolve(5).then(value => {
    console.log(label)

    return value + extra
  })
  const objectLogged = Promise.resolve(6).then(value => {
    if (ok) {
      console.log(user.name)

      return value + extra
    }

    return value
  })

  console.log(await raw, await added, await logged, await objectLogged)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_promise_chain_context_\d+ \{\n {2}double extra;\n\} ccjs_promise_chain_context_\d+;/
  )
  assert.match(
    result.code,
    /typedef struct ccjs_promise_chain_context_\d+ \{\n {2}const char \*literal;\n {2}double extra;\n\} ccjs_promise_chain_context_\d+;/
  )
  assert.match(
    result.code,
    /typedef struct ccjs_promise_chain_context_\d+ \{\n {2}ccjs_value label;\n {2}double extra;\n\} ccjs_promise_chain_context_\d+;/
  )
  assert.match(
    result.code,
    /typedef struct ccjs_promise_chain_context_\d+ \{\n {2}double ok;\n {2}ccjs_value user;\n {2}double extra;\n\} ccjs_promise_chain_context_\d+;/
  )
  assert.match(result.code, /static void ccjs_promise_chain_context_\d+_finalize\(void \*context\);/)
  assert.match(
    result.code,
    /ccjs_promise_chain_context_\d+\* captured = \(ccjs_promise_chain_context_\d+\*\)context;\n {2}ccjs_release\(captured->label\);/
  )
  assert.match(
    result.code,
    /ccjs_promise_chain_context_\d+\* captured = \(ccjs_promise_chain_context_\d+\*\)context;\n {2}ccjs_release\(captured->user\);/
  )
  assert.match(
    result.code,
    /ccjs_promise_chain_context_\d+\* captured = \(ccjs_promise_chain_context_\d+\*\)context;\n {2}double extra = captured->extra;/
  )
  assert.match(result.code, /double ok = captured->ok;/)
  assert.match(result.code, /const char \*literal = captured->literal;/)
  assert.match(result.code, /ccjs_string \*label = \(ccjs_string \*\)captured->label\.as\.ref;/)
  assert.match(result.code, /ccjs_value user = captured->user;/)
  assert.match(result.code, /ccjs_promise_callback_ctx_\d+->literal = literal;/)
  assert.match(
    result.code,
    /ccjs_promise_callback_ctx_\d+->label\.tag = CCJS_TAG_STRING;\n {2}ccjs_promise_callback_ctx_\d+->label\.as\.ref = \(ccjs_ref \*\)&label->header;\n {2}ccjs_retain\(ccjs_promise_callback_ctx_\d+->label\);/
  )
  assert.match(result.code, /ccjs_promise_callback_ctx_\d+->ok = ok;/)
  assert.match(
    result.code,
    /ccjs_promise_callback_ctx_\d+->user = user;\n {2}ccjs_retain\(ccjs_promise_callback_ctx_\d+->user\);/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_chain\(ccjs_promise_\d+, ccjs_promise_chain_arrow_\d+, 0, ccjs_promise_callback_ctx_\d+, ccjs_promise_chain_context_\d+_finalize, &raw\) != CCJS_OK\) \{/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_chain\(ccjs_promise_\d+, ccjs_promise_chain_arrow_\d+, 0, ccjs_promise_callback_ctx_\d+, ccjs_promise_chain_context_\d+_finalize, &added\) != CCJS_OK\) \{/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_chain\(ccjs_promise_\d+, ccjs_promise_chain_arrow_\d+, 0, ccjs_promise_callback_ctx_\d+, ccjs_promise_chain_context_\d+_finalize, &logged\) != CCJS_OK\) \{/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_chain\(ccjs_promise_\d+, ccjs_promise_chain_arrow_\d+, 0, ccjs_promise_callback_ctx_\d+, ccjs_promise_chain_context_\d+_finalize, &objectLogged\) != CCJS_OK\) \{/
  )
})

test('rejects mutable Promise callback captures in C with stable diagnostics', () => {
  assertDiagnostic(
    `export function main(): void {
  let total = 0
  const promise = Promise.resolve(1).then(value => {
    total = total + value

    return total
  })
}
`,
    'CCJS_C_ASYNC',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  let handled = 0
  const promise = Promise.reject('bad').catch(error => {
    handled = handled + 1

    return handled
  })
}
`,
    'CCJS_C_ASYNC',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `function make(): Promise<number> {
  let total = 0

  return Promise.resolve(1).then(value => {
    total = total + value

    return total
  })
}

export async function main(): Promise<void> {
  console.log(await make())
}
`,
    'CCJS_C_ASYNC',
    {
      target: 'c'
    }
  )
})

test('lowers Promise callbacks with try catch finally to C runtime promises', () => {
  const result = compileSource(
    `export async function main(): Promise<void> {
  const handled = Promise.resolve(3).then(value => {
    try {
      if (value > 2) {
        throw 'large'
      }

      return value
    } catch (error) {
      console.log(error)

      return 7
    } finally {
      console.log('chain finally')
    }

    return 0
  })
  const finalized = Promise.resolve(2).then(value => {
    try {
      return value * 2
    } finally {
      console.log('return finally')
    }

    return 0
  })

  console.log(await handled, await finalized)
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /static ccjs_status ccjs_promise_chain_arrow_\d+\(void \*context, ccjs_value ccjs_value_input, ccjs_value \*out\) \{[\s\S]*ccjs_try_\d+_catch:/
  )
  assert.match(result.code, /ccjs_error_active = 1;\n\s+goto ccjs_try_\d+_catch;/)
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)error->len, error->bytes\);/)
  assert.match(
    result.code,
    /\(\*out\) = ccjs_number_value\(7\);\n\s+ccjs_return_active = 1;\n\s+goto ccjs_try_\d+_finally;/
  )
  assert.match(result.code, /printf\("%s\\n", "chain finally"\);/)
  assert.match(
    result.code,
    /\(\*out\) = ccjs_number_value\(\(value \* 2\)\);\n\s+ccjs_return_active = 1;\n\s+goto ccjs_try_\d+_finally;/
  )
  assert.match(result.code, /printf\("%s\\n", "return finally"\);/)
  assert.match(
    result.code,
    /if \(ccjs_promise_chain\(ccjs_promise_\d+, ccjs_promise_chain_arrow_\d+, 0, 0, 0, &handled\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
  assert.match(
    result.code,
    /if \(ccjs_promise_chain\(ccjs_promise_\d+, ccjs_promise_chain_arrow_\d+, 0, 0, 0, &finalized\) != CCJS_OK\)\s+goto ccjs_cleanup;/
  )
})

test('passes loop context to C Promise callbacks that schedule timers', () => {
  const result = compileSource(
    `export function main(): void {
  const pending = Promise.resolve(1).then(value => {
    setTimeout(() => {
      console.log(value)
    }, 1)

    return value
  })
}
`,
    {
      target: 'c'
    }
  )

  assert.match(
    result.code,
    /typedef struct ccjs_promise_chain_context_\d+ \{\n {2}ccjs_loop \*ccjs_loop;\n\} ccjs_promise_chain_context_\d+;/
  )
  assert.match(
    result.code,
    /ccjs_promise_chain_context_\d+\* captured = \(ccjs_promise_chain_context_\d+\*\)context;\n {2}if \(captured->ccjs_loop == 0\) return CCJS_ERR_TYPE;\n {2}ccjs_loop \*ccjs_loop = captured->ccjs_loop;/
  )
  assert.match(
    result.code,
    /typedef struct ccjs_callback_context_\d+ \{\n {2}double value;\n\} ccjs_callback_context_\d+;/
  )
  assert.match(result.code, /ccjs_promise_callback_ctx_\d+->ccjs_loop = ccjs_loop;/)
  assert.match(result.code, /ccjs_callback_ctx_\d+->value = value;/)
  assert.match(
    result.code,
    /ccjs_loop_set_timeout\(ccjs_loop, 1, ccjs_timer_callback_run, ccjs_timer_ctx_\d+, ccjs_timer_callback_finalize, 0\)/
  )
  assert.match(
    result.code,
    /ccjs_promise_chain\(ccjs_promise_\d+, ccjs_promise_chain_arrow_\d+, 0, ccjs_promise_callback_ctx_\d+, ccjs_promise_chain_context_\d+_finalize, &pending\)/
  )
})

test('compiles C collection values across function boundaries', () => {
  const result = compileSource(
    `function makeNums(): number[] {
  const nums = [2, 3, 5]

  return nums
}

function sumNums(nums: number[]): number {
  let total = 0

  for (const value of nums) {
    total = total + value
  }

  return total
}

function makeScores(): Map<string, number> {
  const scores: Map<string, number> = new Map([['Ada', 7], ['Grace', 9]])

  return scores
}

function totalScores(scores: Map<string, number>): number {
  let total = 0

  for (const entry of scores.set('Alan', 5)) {
    total = total + entry.value
  }

  return total
}

function makeSeen(): Set<string> {
  const seen: Set<string> = new Set(['Ada'])
  seen.add('Grace')

  return seen
}

function seenCount(seen: Set<string>): number {
  let count = 0

  if (seen.has('Ada')) {
    count = count + 1
  }

  if (seen.has('Grace')) {
    count = count + 1
  }

  return count
}

export function main(): void {
  const nums = makeNums()
  const scores = makeScores()
  const seen = makeSeen()
  const sumFromNums = sumNums(nums)
  const sumFromCall = sumNums(makeNums())
  const totalFromScores = totalScores(scores)
  const totalFromCall = totalScores(makeScores())
  const seenFromSeen = seenCount(seen)
  const seenSizeFromCall = makeSeen().size

  console.log(sumFromNums, sumFromCall, totalFromScores, totalFromCall, scores.size, seenFromSeen, seenSizeFromCall)
}
`,
    {
      target: 'c'
    }
  )
  const makeNums = result.ir.functionDeclarations.find((item) => item.name === 'makeNums')
  const makeScores = result.ir.functionDeclarations.find((item) => item.name === 'makeScores')
  const makeSeen = result.ir.functionDeclarations.find((item) => item.name === 'makeSeen')

  assert.equal(makeNums?.returnType, 'array')
  assert.equal(makeNums?.returnArrayElementType, 'number')
  assert.equal(makeScores?.returnType, 'map')
  assert.equal(makeScores?.returnMapKeyType, 'string')
  assert.equal(makeScores?.returnMapValueType, 'number')
  assert.equal(makeSeen?.returnType, 'set')
  assert.equal(makeSeen?.returnSetElementType, 'string')
  assert.match(result.code, /ccjs_value makeNums\(void\);/)
  assert.match(result.code, /double sumNums\(ccjs_value nums\);/)
  assert.match(result.code, /if \(nums\.tag != CCJS_TAG_ARRAY \|\| nums\.as\.ref == 0\)\s+goto ccjs_cleanup;/)
  assert.match(result.code, /ccjs_value makeScores\(void\);/)
  assert.match(result.code, /double totalScores\(ccjs_value scores\);/)
  assert.match(result.code, /if \(scores\.tag != CCJS_TAG_MAP \|\| scores\.as\.ref == 0\)\s+goto ccjs_cleanup;/)
  assert.match(result.code, /ccjs_value makeSeen\(void\);/)
  assert.match(result.code, /double seenCount\(ccjs_value seen\);/)
  assert.match(result.code, /if \(seen\.tag != CCJS_TAG_SET \|\| seen\.as\.ref == 0\)\s+goto ccjs_cleanup;/)
  assert.match(result.code, /ccjs_array_len\(nums, &ccjs_for_length_\d+\)/)
  assert.match(result.code, /ccjs_map \*ccjs_for_map_\d+ = \(ccjs_map \*\)scores\.as\.ref;/)
  assert.match(result.code, /ccjs_set_has\(seen, ccjs_value_\d+, &ccjs_set_has_\d+\)/)
})

test('checks Map bracket syntax as typed get and set sugar', () => {
  const result = compileSource(
    `export function main(): void {
  const headers: Map<string, string> = new Map()
  headers['content-type'] = 'application/json'
  const contentType = headers['content-type']
  const fallback = headers['accept'] ?? 'text/plain'
  console.log(contentType ?? 'missing', fallback, headers.size)
}
`,
    {
      target: 'js'
    }
  )
  const js = compileSource(
    `export function main(): void {
  const headers: Map<string, string> = new Map()
  headers['content-type'] = 'application/json'
  const contentType: string | null = headers['content-type']
  console.log(contentType ?? 'missing')
}
`,
    {
      target: 'js'
    }
  )
  const main = result.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)
  const contentType = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'contentType')
  const fallback = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'fallback')
  assert.ok(contentType)
  assert.ok(fallback)

  assert.equal(contentType.valueType, 'string')
  assert.equal(contentType.nullable, true)
  assert.equal(fallback.valueType, 'string')
  assert.deepEqual(result.ir.features, ['collections', 'map-get-null', 'map-index-set', 'runtime-values'])
  assert.deepEqual(result.ir.runtimeRequirements, ['collections', 'managed-values'])
  assert.match(result.code, /function ccjsMapGet\(map, key\) \{/)
  assert.match(result.code, /function ccjsMapSet\(map, key, value\) \{/)
  assert.match(result.code, /ccjsMapSet\(headers, "content-type", "application\/json"\)/)
  assert.match(result.code, /const contentType = ccjsMapGet\(headers, "content-type"\)/)
  assert.match(js.code, /function ccjsMapGet\(map, key\) \{/)
  assert.match(js.code, /function ccjsMapSet\(map, key, value\) \{/)
  assert.match(js.code, /const contentType = ccjsMapGet\(headers, "content-type"\)/)

  assertDiagnostic(
    `export function main(): void {
  const headers: Map<string, string> = new Map()
  const contentType: string = headers['content-type']
  console.log(contentType)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const headers: Map<string, string> = new Map()
  headers[1] = 'application/json'
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const headers: Map<string, string> = new Map()
  headers['content-type'] = 1
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('checks string predicate methods as boolean calls', () => {
  const result = compileSource(
    `function hasAda(name: string): boolean {
  return name.includes('Ada') && name.startsWith('A') && name.endsWith('a')
}

export function main(): void {
  console.log(hasAda('Ada'))
}
`,
    {
      target: 'js'
    }
  )

  assert.match(
    result.code,
    /return \(\(name\.includes\("Ada"\) && name\.startsWith\("A"\)\) && name\.endsWith\("a"\)\)/
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.includes(1)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.startsWith()
}
`,
    'CCJS_ARG_COUNT'
  )
})

test('checks string slice as a string call', () => {
  const result = compileSource(
    `function middle(name: string): string {
  return name.slice(1, 3)
}

export function main(): void {
  console.log(middle('Ada'))
}
`,
    {
      target: 'js'
    }
  )

  assert.match(result.code, /function ccjsStringSlice\(value, start, end\) \{/)
  assert.match(result.code, /return ccjsStringSlice\(name, 1, 3\)/)

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.slice('1', 2)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.slice()
}
`,
    'CCJS_ARG_COUNT'
  )
})

test('checks string split as a string array call', () => {
  const result = compileSource(
    `export function main(): void {
  const parts = 'Ada,Grace'.split(',')
  const first: string = parts[0]
  console.log(first)
}
`,
    {
      target: 'js'
    }
  )

  assert.match(result.code, /function ccjsStringSplit\(value, separator\) \{/)
  assert.match(result.code, /const parts = ccjsStringSplit\("Ada,Grace", ","\)/)
  assert.match(result.code, /const first = parts\[0\]/)
  assert.equal(result.hir.body[0].body[0].valueType, 'array')
  assert.equal(result.hir.body[0].body[0].arrayElementType, 'string')

  assertDiagnostic(
    `export function main(): void {
  'Ada'.split(1)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  'Ada'.split()
}
`,
    'CCJS_ARG_COUNT'
  )
})

test('checks string trim as a string call', () => {
  const result = compileSource(
    `function clean(name: string): string {
  return name.trim()
}

export function main(): void {
  console.log(clean(' Ada '))
}
`,
    {
      target: 'js'
    }
  )

  assert.match(result.code, /return name\.trim\(\)/)

  assertDiagnostic(
    `export function main(): void {
  const name = 'Ada'
  name.trim(1)
}
`,
    'CCJS_ARG_COUNT'
  )
})

test('checks String conversion as a typed string call', () => {
  const result = compileSource(
    `function label(value: number): string {
  return String(value)
}

export function main(): void {
  console.log(label(42), String(true), String('Ada'), String(null))
}
`,
    {
      target: 'js'
    }
  )

  assert.match(result.code, /return String\(value\)/)

  assertDiagnostic(
    `export function main(): void {
  String()
}
`,
    'CCJS_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  String({ name: 'Ada' })
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('checks Number conversion as a nullable typed number call', () => {
  const source = `function parsePort(text: string): number | null {
  return Number(text)
}

export function main(): void {
  const port = Number('8080') ?? 3000
  console.log(parsePort('42') ?? port)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  assert.match(js.code, /function ccjsNumberFromString\(text\) \{/)
  assert.match(js.code, /Number\.isNaN\(value\) \? null : value/)
  assert.doesNotMatch(js.code, /Number\.isFinite/)
  assert.match(js.code, /return ccjsNumberFromString\(text\)/)
  assert.match(js.code, /const port = \(ccjsNumberFromString\("8080"\) \?\? 3000\)/)

  assertDiagnostic(
    `export function main(): void {
  Number()
}
`,
    'CCJS_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  Number(42)
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const text: string | null = null
  Number(text)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('checks numeric casts as number calls', () => {
  const source = `function convert(value: number): number {
  return i32(value) + u32(value) + u64(value) + f32(value) + f64(value)
}

export function main(): void {
  const value = convert(3.9)
  console.log(value)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })

  assert.deepEqual(js.ir.features, ['numeric-casts'])
  assert.match(js.code, /function ccjsCheckedIntegerCast\(value, min, max\) \{/)
  assert.match(
    js.code,
    /return \(\(\(\(ccjsI32\(value\) \+ ccjsU32\(value\)\) \+ ccjsU64\(value\)\) \+ ccjsF32\(value\)\) \+ ccjsF64\(value\)\)/
  )
  assert.match(js.code, /function ccjsF32\(value\) \{/)
  assert.match(c.code, /long long ccjs_i32_truncated_\d+ = \(long long\)ccjs_i32_value_\d+;/)
  assert.match(c.code, /ccjs_u32_truncated_\d+ < 0LL \|\| ccjs_u32_truncated_\d+ > 4294967295LL/)
  assert.match(c.code, /ccjs_u64_truncated_\d+ < 0LL \|\| ccjs_u64_truncated_\d+ > 9007199254740991LL/)
  assert.match(c.code, /double ccjs_f32_\d+ = \(double\)\(\(float\)value\);/)

  assertDiagnostic(
    `export function main(): void {
  i32()
}
`,
    'CCJS_ARG_COUNT'
  )

  assertDiagnostic(
    `export function main(): void {
  i32('1')
}
`,
    'CCJS_TYPE_MISMATCH'
  )

  assertDiagnostic(
    `export function main(): void {
  const value: number | null = null
  f64(value)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('checks typed object aliases and readonly fields', () => {
  const result = compileSource(
    `type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1, name: 'Ada' }
  user.name = 'Grace'
  console.log(user.name)
}
`,
    {
      target: 'js'
    }
  )

  assert.match(result.code, /const user = \{ id: 1, name: "Ada" \}/)
  assert.doesNotMatch(result.code, /type User/)
})

test('keeps typed object shape metadata for C lowering', () => {
  const source = `type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { name: 'Ada', id: 1 }
  const id = user.id
  console.log(id)
}
`
  const js = compileSource(source, {
    target: 'js'
  })
  const c = compileSource(source, {
    target: 'c'
  })
  const main = js.hir.body.find((item) => item.type === 'FunctionDeclaration' && item.name === 'main')
  assert.ok(main)
  const user = main.body.find((item) => item.type === 'VariableDeclaration' && item.name === 'user')
  assert.ok(user)

  assert.deepEqual(
    user.shape.fields.map((field) => ({
      name: field.name,
      readonly: field.readonly,
      valueType: field.valueType
    })),
    [
      {
        name: 'id',
        readonly: true,
        valueType: 'number'
      },
      {
        name: 'name',
        readonly: false,
        valueType: 'string'
      }
    ]
  )
  assert.match(c.code, /\{ "id", CCJS_FIELD_READONLY \}/)
  assert.match(c.code, /\{ "name", 0 \}/)
  assert.match(c.code, /ccjs_object_init_known\(user, 0, ccjs_number_value\(1\)\)/)
  assert.match(c.code, /ccjs_object_get_known\(user, 0, &ccjs_field_\d+\)/)
})

test('rejects readonly typed object field assignment', () => {
  assertDiagnostic(
    `type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1, name: 'Ada' }
  user.id = 2
}
`,
    'CCJS_ASSIGN_READONLY_FIELD'
  )
})

test('checks typed object string index fields', () => {
  const result = compileSource(
    `type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1, name: 'Ada' }
  const name: string = user['name']
  console.log(name)
}
`,
    {
      target: 'js'
    }
  )

  assert.match(result.code, /const name = user\["name"\]/)

  assertDiagnostic(
    `type User = {
  readonly id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1, name: 'Ada' }
  user['id'] = 2
}
`,
    'CCJS_ASSIGN_READONLY_FIELD'
  )
})

test('rejects typed object shape mismatches', () => {
  assertDiagnostic(
    `type User = {
  id: number,
  name: string
}

export function main(): void {
  const user: User = { id: 1 }
  console.log(user)
}
`,
    'CCJS_MISSING_FIELD'
  )

  assertDiagnostic(
    `type User = {
  id: number
}

export function main(): void {
  const user: User = { id: 1, extra: true }
  console.log(user)
}
`,
    'CCJS_UNKNOWN_FIELD'
  )

  assertDiagnostic(
    `type User = {
  id: number
}

export function main(): void {
  const user: User = { id: 'Ada' }
  console.log(user)
}
`,
    'CCJS_TYPE_MISMATCH'
  )
})

test('rejects unknown typed object fields on member access', () => {
  assertDiagnostic(
    `type User = {
  name: string
}

export function main(): void {
  const user: User = { name: 'Ada' }
  console.log(user.age)
}
`,
    'CCJS_UNKNOWN_FIELD'
  )
})

test('keeps block declarations scoped to the block', () => {
  assertDiagnostic(
    `export function main(): void {
  if (true) {
    const hidden = 1
  }

  console.log(hidden)
}
`,
    'CCJS_UNKNOWN_NAME'
  )
})

test('keeps while body declarations scoped to the body', () => {
  assertDiagnostic(
    `export function main(): void {
  while (false) {
    const hidden = 1
  }

  console.log(hidden)
}
`,
    'CCJS_UNKNOWN_NAME'
  )
})

test('keeps for initializer scoped to the loop', () => {
  assertDiagnostic(
    `export function main(): void {
  for (let index = 0; index < 1; index = index + 1) {
    console.log(index)
  }

  console.log(index)
}
`,
    'CCJS_UNKNOWN_NAME'
  )
})

test('rejects assignment to const for of bindings', () => {
  assertDiagnostic(
    `export function main(): void {
  for (const value of [1]) {
    value = 2
  }
}
`,
    'CCJS_ASSIGN_CONST'
  )
})

test('rejects for in with a stable diagnostic code', () => {
  assertDiagnostic(
    `export function main(): void {
  const value = { name: 'Ada' }

  for (const key in value) {
    console.log(key)
  }
}
`,
    'CCJS_NO_FOR_IN'
  )
})

test('rejects break outside loops and switches', () => {
  assertDiagnostic(
    `export function main(): void {
  break
}
`,
    'CCJS_BREAK_OUTSIDE'
  )
})

test('rejects continue outside loops', () => {
  assertDiagnostic(
    `export function main(): void {
  continue
}
`,
    'CCJS_CONTINUE_OUTSIDE'
  )
})

test('rejects non-boolean conditions', () => {
  assertDiagnostic(
    `export function main(): void {
  if (1) {
    console.log('bad')
  }
}
`,
    'CCJS_CONDITION_TYPE'
  )

  assertDiagnostic(
    `export function main(): void {
  while ('yes') {
    console.log('bad')
  }
}
`,
    'CCJS_CONDITION_TYPE'
  )

  assertDiagnostic(
    `export function main(): void {
  for (let index = 0; 'yes'; index = index + 1) {
    console.log(index)
  }
}
`,
    'CCJS_CONDITION_TYPE'
  )
})

test('rejects duplicate switch default branches', () => {
  assertDiagnostic(
    `export function main(): void {
  switch (1) {
    default:
      console.log('a')
    default:
      console.log('b')
  }
}
`,
    'CCJS_DUPLICATE_DEFAULT'
  )
})

test('rejects switch type mismatches', () => {
  assertDiagnostic(
    `export function main(): void {
  switch (1) {
    case 'one':
      console.log('bad')
  }
}
`,
    'CCJS_SWITCH_TYPE'
  )

  assertDiagnostic(
    `export function main(): void {
  const value = { code: 1 }

  switch (value) {
    default:
      console.log('bad')
  }
}
`,
    'CCJS_SWITCH_TYPE'
  )
})

test('rejects await outside async functions', () => {
  assertDiagnostic(
    `export function main(): void {
  const value = await Promise.resolve(1)
  console.log(value)
}
`,
    'CCJS_AWAIT_OUTSIDE_ASYNC'
  )
})

test('accepts await in top-level C entry statements', () => {
  const result = compileSource(
    `const value = await Promise.resolve(1)
console.log(value)
`,
    {
      target: 'c'
    }
  )

  assert.match(result.code, /int main\(void\) \{/)
  assert.deepEqual(result.ir.runtimeRequirements, ['async-runtime'])
})

test('compiles a static ESM module graph to JS bundle', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-modules-'))

  try {
    await writeFile(
      join(dir, 'lib.js'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.js'),
      `import { greet } from './lib.js'

export function main(): void {
  greet()
}
`
    )

    const result = await compileFile(join(dir, 'main.js'), {
      target: 'js'
    })

    assert.match(result.code, /function greet\(\)/)
    assert.match(result.code, /function main\(\)/)
    assert.doesNotMatch(result.code, /import \{/)
    assert.doesNotMatch(result.code, /export function/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('compiles a static ESM module graph to C bundle', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-modules-'))

  try {
    await writeFile(
      join(dir, 'lib.js'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.js'),
      `import { greet } from './lib.js'

export function main(): void {
  greet()
}
`
    )

    const result = await compileFile(join(dir, 'main.js'), {
      target: 'c'
    })

    assert.match(result.code, /void greet\(void\);/)
    assert.match(result.code, /void ccjs_main\(void\);/)
    assert.match(result.code, /void greet\(void\) \{/)
    assert.match(result.code, /greet\(\);/)
    assert.match(result.code, /int main\(void\) \{/)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

test('marks timer calls and lowers setImmediate/setTimeout to C loop work', () => {
  const result = compileSource(
    `function onImmediate(): void {
  console.log('immediate')
}

function onTimeout(): void {
  console.log('timeout')
}

function onInterval(): void {
  console.log('interval')
}

function schedule(): void {
  const timeout = setTimeout(onTimeout, 1)
  clearTimeout(timeout)
  const interval = setInterval(onInterval, 1)
  clearInterval(interval)
}

function scheduleLater(): void {
  setTimeout(onTimeout, 1)
}

schedule()
const immediate = setImmediate(scheduleLater)
clearImmediate(immediate)
`,
    {
      target: 'c'
    }
  )

  assert.deepEqual(result.ir.features, ['timers'])
  assert.deepEqual(result.ir.runtimeRequirements, ['async-runtime', 'callback-values', 'managed-values', 'timers'])
  assert.match(result.code, /#include "ccjs\/loop\.h"/)
  assert.match(result.code, /#include "ccjs\/callback\.h"/)
  assert.match(result.code, /static ccjs_status ccjs_timer_callback_run\(void \*context\)/)
  assert.match(result.code, /void schedule\(ccjs_loop \*ccjs_loop\);/)
  assert.match(result.code, /int main\(void\) \{/)
  assert.match(result.code, /schedule\(&ccjs_loop\);/)
  assert.match(result.code, /ccjs_timer_handle \*timeout = 0;/)
  assert.match(result.code, /ccjs_timer_handle \*interval = 0;/)
  assert.match(result.code, /ccjs_timer_handle \*immediate = 0;/)
  assert.match(
    result.code,
    /ccjs_loop_set_timeout\(ccjs_loop, 1, ccjs_timer_callback_run, ccjs_timer_ctx_\d+, ccjs_timer_callback_finalize, &timeout\)/
  )
  assert.match(
    result.code,
    /ccjs_loop_set_interval\(ccjs_loop, 1, ccjs_timer_callback_run, ccjs_timer_ctx_\d+, ccjs_timer_callback_finalize, &interval\)/
  )
  assert.match(
    result.code,
    /ccjs_loop_queue_immediate\(&ccjs_loop, ccjs_timer_callback_run, ccjs_timer_ctx_\d+, ccjs_timer_callback_finalize, &immediate\)/
  )
  assert.match(result.code, /ccjs_loop_clear_timer\(timeout\);/)
  assert.match(result.code, /ccjs_loop_clear_timer\(interval\);/)
  assert.match(result.code, /ccjs_loop_clear_timer\(immediate\);/)
  assert.match(result.code, /scheduleLater\(\(ccjs_loop \*\)context\);/)
  assert.match(
    result.code,
    /ccjs_callback_new\(&ccjs_default_allocator, ccjs_callback_scheduleLater_\d+, &ccjs_loop, 0, &ccjs_callback_\d+\)/
  )
  assert.match(result.code, /while \(ccjs_loop_has_work\(&ccjs_loop\)\) \{/)
  assert.match(result.code, /ccjs_loop_poll\(&ccjs_loop, ccjs_performance_now\(\)\)/)

  assertDiagnostic(
    `export function main(): void {
  setInterval(() => {}, 1)
}
`,
    'CCJS_C_TIMER_HANDLE',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  clearTimeout(1)
}
`,
    'CCJS_TYPE_MISMATCH',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `export function main(): void {
  const timeout = setTimeout(() => {}, 1)
  timeout.unref()
}
`,
    'CCJS_TIMER_REF_UNREF'
  )

  assertDiagnostic(
    `export function main(): void {
  const interval = setInterval(() => {}, 1)
  interval.ref()
}
`,
    'CCJS_TIMER_REF_UNREF'
  )

  assertDiagnostic(
    `export function main(): void {
  setTimeout(async () => {
    await Promise.resolve(1)
  }, 1)
}
`,
    'CCJS_ASYNC_TIMER_CALLBACK'
  )

  assertDiagnostic(
    `async function later(): Promise<void> {
  await Promise.resolve(1)
}

export function main(): void {
  setImmediate(later)
}
`,
    'CCJS_ASYNC_TIMER_CALLBACK'
  )
})

test('rejects unknown imported exports', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ccjs-modules-'))

  try {
    await writeFile(
      join(dir, 'lib.js'),
      `export function greet(): void {
  console.log('from lib')
}
`
    )
    await writeFile(
      join(dir, 'main.js'),
      `import { missing } from './lib.js'

export function main(): void {
  missing()
}
`
    )

    await assert.rejects(
      () =>
        compileFile(join(dir, 'main.js'), {
          target: 'js'
        }),
      (error) => {
        if (!(error instanceof CompileError)) {
          return false
        }

        assert.equal(
          error.diagnostics.some((item) => item.code === 'CCJS_UNKNOWN_EXPORT'),
          true
        )
        return true
      }
    )
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})

function assertDiagnostic(source: string, code: string, options: { target?: CompileTarget } = {}): void {
  assert.throws(
    () => {
      compileSource(source, {
        target: options.target ?? 'js'
      })
    },
    (error) => {
      if (!(error instanceof CompileError)) {
        return false
      }

      assert.equal(
        error.diagnostics.some((item) => item.code === code),
        true
      )
      return true
    }
  )
}
