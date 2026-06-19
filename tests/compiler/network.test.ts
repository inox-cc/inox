import test from 'node:test'
import {
  assert,
  assertDiagnostic,
  cLibuvOptions,
  collectIrGlobalRoots,
  CompileError,
  compileSource
} from '../helpers/compiler-smoke.ts'

test('emits C dgram runtime include for node:dgram imports', () => {
  const result = compileSource(
    `import dgram from 'node:dgram'

export function main(): void {
}
`,
    cLibuvOptions
  )

  assert.match(result.code, /#include "inox\/dgram\.h"/)
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
    cLibuvOptions
  )

  assert.match(
    result.code,
    /static inox_status inox_dgram_message_handler_\d+\(void\* user, inox_dgram_socket\* inox_socket, const char\* inox_bytes, size_t inox_len, const char\* inox_host, int inox_port\);/
  )
  assert.match(result.code, /inox_dgram_socket_new\(&inox_loop, 0, 0, &server\)/)
  assert.match(result.code, /inox_dgram_socket_on_message\(server, inox_dgram_message_handler_\d+, 0\)/)
  assert.match(result.code, /inox_dgram_bind_flags\(server, "127\.0\.0\.1", \(int\)\(0\), 0\)/)
  assert.match(result.code, /inox_dgram_recv_start\(server\)/)
  assert.match(result.code, /inox_dgram_send\(inox_socket, inox_bytes, inox_len, inox_host, \(int\)\(inox_port\)\)/)
  assert.match(result.code, /inox_dgram_socket_address\(server, &address\)/)
  assert.match(result.code, /printf\("%g\\n", \(\(double\)address\.port\)\)/)
})

test('lowers node:dgram createSocket and bind option objects with keyword keys', () => {
  const result = compileSource(
    `import { createSocket } from 'node:dgram'

const socket = createSocket({ type: 'udp4' })
socket.bind({ port: 0, address: '127.0.0.1' })
`,
    cLibuvOptions
  )

  assert.match(result.code, /inox_dgram_socket_new\(&inox_loop, 0, 0, &socket\)/)
  assert.match(result.code, /inox_dgram_bind_flags\(socket, "127\.0\.0\.1", \(int\)\(0\), 0\)/)
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
    cLibuvOptions
  )

  assert.match(result.code, /inox_dgram_socket_connect\(socket, "127\.0\.0\.1", \(int\)\(41234\)\)/)
  assert.match(result.code, /inox_dgram_socket_remote_address\(socket, &remote\)/)
  assert.match(result.code, /inox_dgram_send_connected\(socket, "hello", 5\)/)
  assert.match(result.code, /inox_dgram_socket_disconnect\(socket\)/)
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
    cLibuvOptions
  )

  assert.match(result.code, /inox_dgram_bind_flags\(socket, "127\.0\.0\.1", \(int\)\(0\), INOX_DGRAM_BIND_REUSEADDR\)/)
  assert.match(result.code, /inox_dgram_set_broadcast\(socket, 0 \? 1 : 0\)/)
  assert.match(result.code, /inox_dgram_set_ttl\(socket, \(int\)\(32\)\)/)
  assert.match(result.code, /inox_dgram_set_send_buffer_size\(socket, \(int\)\(4096\)\)/)
  assert.match(result.code, /inox_dgram_set_recv_buffer_size\(socket, \(int\)\(4096\)\)/)
  assert.match(result.code, /inox_dgram_get_send_buffer_size\(socket, &inox_dgram_buffer_size_\d+\)/)
  assert.match(result.code, /inox_dgram_get_recv_buffer_size\(socket, &inox_dgram_buffer_size_\d+\)/)
  assert.match(result.code, /inox_dgram_unref\(socket\)/)
  assert.match(result.code, /inox_dgram_ref\(socket\)/)
})

test('reports unsupported node:dgram compatibility shapes with dgram diagnostics', () => {
  assertDiagnostic(
    `import dgram from 'node:dgram'

const socket = dgram.createSocket('udp6')
`,
    'INOX_DGRAM_SOCKET',
    cLibuvOptions
  )

  assertDiagnostic(
    `import dgram from 'node:dgram'

const socket = dgram.createSocket('udp4')
socket.addMembership('224.0.0.1')
`,
    'INOX_DGRAM_SOCKET',
    cLibuvOptions
  )
})

test('emits C net runtime include for node:net imports', () => {
  const result = compileSource(
    `import net from 'node:net'

export function main(): void {
}
`,
    cLibuvOptions
  )

  assert.match(result.code, /#include "inox\/net\.h"/)
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
    cLibuvOptions
  )

  assert.match(
    result.code,
    /static inox_status inox_net_connection_handler_\d+\(void\* user, inox_net_server\* inox_server, inox_net_socket\* inox_socket\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_net_event_handler_\d+\(void\* user, inox_net_server\* inox_server\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_net_error_handler_\d+\(void\* user, inox_net_server\* inox_server, inox_status inox_error_status\);/
  )
  assert.match(result.code, /inox_net_server_new\(&inox_loop, inox_net_connection_handler_\d+, 0, &server\)/)
  assert.match(result.code, /inox_net_server_on_listening\(server, inox_net_event_handler_\d+, 0\)/)
  assert.match(result.code, /inox_net_server_on_close\(server, inox_net_event_handler_\d+, 0\)/)
  assert.match(result.code, /inox_net_server_on_error\(server, inox_net_error_handler_\d+, 0\)/)
  assert.match(result.code, /inox_net_server_listen\(server, "127\.0\.0\.1", \(int\)\(0\), \(int\)\(16\)\)/)
  assert.match(result.code, /inox_net_socket_end\(inox_socket, "hello", 5\)/)
  assert.match(result.code, /inox_net_address address;/)
  assert.match(result.code, /inox_net_server_address\(server, &address\)/)
  assert.match(result.code, /printf\("%s %s %g\\n", address\.address, address\.family, \(\(double\)address\.port\)\)/)
})

test('lowers chained node:net createServer listen calls', () => {
  const result = compileSource(
    `import { createServer } from 'node:net'

createServer((socket) => socket.end('ok')).listen(0, '127.0.0.1')
`,
    cLibuvOptions
  )

  assert.match(result.code, /inox_net_server\* inox_net_server_\d+ = 0;/)
  assert.match(
    result.code,
    /inox_net_server_new\(&inox_loop, inox_net_connection_handler_\d+, 0, &inox_net_server_\d+\)/
  )
  assert.match(
    result.code,
    /inox_net_server_listen\(inox_net_server_\d+, "127\.0\.0\.1", \(int\)\(0\), \(int\)\(128\)\)/
  )
  assert.match(result.code, /inox_net_socket_end\(inox_socket, "ok", 2\)/)
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
    cLibuvOptions
  )

  assert.match(
    result.code,
    /static inox_status inox_net_socket_event_handler_\d+\(void\* user, inox_net_socket\* inox_socket\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_net_socket_data_handler_\d+\(void\* user, inox_net_socket\* inox_socket, const char\* inox_bytes, size_t inox_len\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_net_socket_write_handler_\d+\(void\* user, inox_net_socket\* inox_socket, inox_status inox_write_status\);/
  )
  assert.match(
    result.code,
    /static inox_status inox_net_socket_error_handler_\d+\(void\* user, inox_net_socket\* inox_socket, inox_status inox_error_status\);/
  )
  assert.match(result.code, /inox_net_connect\(&inox_loop, "127\.0\.0\.1", \(int\)\(9000\), 0, 0, 0, 0, &client\)/)
  assert.match(result.code, /inox_net_socket_on_connect\(client, inox_net_socket_event_handler_\d+, 0\)/)
  assert.match(result.code, /inox_net_socket_set_encoding\(client, "utf8", 4\)/)
  assert.match(result.code, /inox_net_socket_on_data\(client, inox_net_socket_data_handler_\d+, 0\)/)
  assert.match(result.code, /inox_net_socket_read_start\(client\)/)
  assert.match(result.code, /inox_net_socket_on_end\(client, inox_net_socket_event_handler_\d+, 0\)/)
  assert.match(result.code, /inox_net_socket_on_close\(client, inox_net_socket_event_handler_\d+, 0\)/)
  assert.match(result.code, /inox_net_socket_on_error\(client, inox_net_socket_error_handler_\d+, 0\)/)
  assert.match(result.code, /inox_net_socket_on_drain\(client, inox_net_socket_event_handler_\d+, 0\)/)
  assert.match(
    result.code,
    /inox_net_socket_write_with_callback\(inox_socket, "ping", 4, inox_net_socket_write_handler_\d+, 0\)/
  )
  assert.match(result.code, /printf\("%\.\*s\\n", \(int\)inox_len, inox_bytes\)/)
  assert.match(
    result.code,
    /inox_net_socket_end_with_callback\(inox_socket, inox_bytes, inox_len, inox_net_socket_write_handler_\d+, 0\)/
  )
  assert.match(result.code, /inox_net_socket_destroy\(inox_socket\)/)
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
    cLibuvOptions
  )

  assert.match(result.code, /inox_net_connect\(&inox_loop, "127\.0\.0\.1", \(int\)\(9000\), 0, 0, 0, 0, &client\)/)
  assert.match(result.code, /inox_net_address local;/)
  assert.match(result.code, /inox_net_socket_address\(client, &local\)/)
  assert.match(result.code, /inox_net_socket_remote_address\(client, &inox_net_address_\d+\)/)
  assert.match(result.code, /const char \*remoteAddress = inox_net_address_\d+\.address;/)
  assert.match(result.code, /remotePort = \(double\)inox_net_address_\d+\.port;/)
  assert.match(result.code, /inox_net_socket_address\(client, &inox_net_address_\d+\)/)
  assert.match(result.code, /const char \*localAddress = inox_net_address_\d+\.address;/)
  assert.match(result.code, /localPort = \(double\)inox_net_address_\d+\.port;/)
  assert.match(result.code, /inox_net_socket_get_bytes_read\(client, &inox_net_counter\)/)
  assert.match(result.code, /inox_net_socket_get_bytes_written\(client, &inox_net_counter\)/)
  assert.match(result.code, /inox_net_socket_set_no_delay\(client, 1 \? 1 : 0\)/)
  assert.match(result.code, /inox_net_socket_set_no_delay\(client, 0 \? 1 : 0\)/)
  assert.match(result.code, /inox_net_socket_set_keep_alive\(client, 1 \? 1 : 0, \(unsigned int\)\(10\)\)/)
  assert.match(result.code, /inox_net_socket_unref\(client\)/)
  assert.match(result.code, /inox_net_socket_ref\(client\)/)
  assert.match(result.code, /printf\("%s %g %s %g %s %g %g %g\\n"/)
})

test('reports unsupported node:net socket timeout with net diagnostics', () => {
  assertDiagnostic(
    `import net from 'node:net'

const client = net.connect(9000)
client.setTimeout(1000)
`,
    'INOX_NET_SOCKET',
    cLibuvOptions
  )
})

test('emits C http runtime include for node:http imports', () => {
  const result = compileSource(
    `import http from 'node:http'

export function main(): void {
}
`,
    cLibuvOptions
  )

  assert.match(result.code, /#include "inox\/http\.h"/)
})

test('reports libuv-only C APIs when the loop backend is embedded', () => {
  assertDiagnostic(
    `const response = await fetch('https://example.test/hello')
console.log(response.status)
`,
    'INOX_NOT_IMPLEMENTED',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `import dgram from 'node:dgram'
console.log(dgram)
`,
    'INOX_NOT_IMPLEMENTED',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `import net from 'node:net'
console.log(net)
`,
    'INOX_NOT_IMPLEMENTED',
    {
      target: 'c'
    }
  )

  assertDiagnostic(
    `import http from 'node:http'
console.log(http)
`,
    'INOX_NOT_IMPLEMENTED',
    {
      target: 'c'
    }
  )

  let error: unknown = null

  try {
    compileSource(
      `const response = await fetch('https://example.test/')
console.log(response.status)
`,
      {
        target: 'c'
      }
    )
  } catch (caught) {
    error = caught
  }

  assert.ok(error instanceof CompileError)
  assert.equal(error.diagnostics[0].code, 'INOX_NOT_IMPLEMENTED')
  assert.match(error.diagnostics[0].message, /fetch is not implemented for C without libuv/)
})

test('lowers global fetch GET and response text to the C fetch runtime', () => {
  const result = compileSource(
    `const response = await fetch('http://127.0.0.1:9000/hello')
const text = await response.text()
console.log(response.status, response.ok, response.url, text)
`,
    cLibuvOptions
  )

  assert.match(result.code, /#include "inox\/fetch\.h"/)
  assert.match(result.code, /#include "inox\/object\.h"/)
  assert.match(result.code, /inox_fetch\(&inox_loop, "http:\/\/127\.0\.0\.1:9000\/hello", 27, &inox_promise_\d+\)/)
  assert.match(result.code, /inox_fetch_response_text\(&inox_loop, response, &inox_promise_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(response, 0, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(response, 1, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(response, 2, &inox_log_value_\d+\)/)
  assert.match(result.code, /printf\("%g %g %\.\*s %\.\*s\\n"/)
})

test('lowers global fetch init options to the C fetch runtime', () => {
  const result = compileSource(
    `const response = await fetch('http://127.0.0.1:9000/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-INOX': 'fetch'
  },
  body: '{"name":"Ada"}'
})
console.log(response.status)
`,
    cLibuvOptions
  )

  assert.match(
    result.code,
    /inox_fetch_header inox_fetch_headers_\d+\[2\] = \{ \{ "Content-Type", 12, "application\/json", 16 \}, \{ "X-INOX", 6, "fetch", 5 \} \};/
  )
  assert.match(
    result.code,
    /inox_fetch_init inox_fetch_init_\d+ = \{ "POST", 4, inox_fetch_headers_\d+, 2, "\{\\"name\\":\\"Ada\\"\}", 14, inox_undefined_value\(\), 0, 0 \};/
  )
  assert.match(
    result.code,
    /inox_fetch_with_init\(&inox_loop, "http:\/\/127\.0\.0\.1:9000\/users", 27, &inox_fetch_init_\d+, &inox_promise_\d+\)/
  )
})

test('lowers fetch response metadata and headers helpers to the C fetch runtime', () => {
  const result = compileSource(
    `const response = await fetch('http://127.0.0.1:9000/hello?x=1', { redirect: 'manual' })
const headers = response.headers
const contentType = headers.get('content-type')
const hasTrace = response.headers.has('x-trace')
console.log(response.statusText, response.redirected, contentType ?? 'missing', hasTrace)
`,
    cLibuvOptions
  )

  assert.match(
    result.code,
    /inox_fetch_init inox_fetch_init_\d+ = \{ 0, 0, 0, 0, 0, 0, inox_undefined_value\(\), "manual", 6 \};/
  )
  assert.match(result.code, /inox_object_get_known\(response, 5, &headers\)/)
  assert.match(
    result.code,
    /inox_fetch_headers_get\(&inox_default_allocator, headers, "content-type", 12, &inox_fetch_header_value_\d+\)/
  )
  assert.match(result.code, /inox_nullable_value_\d+ = inox_fetch_header_value_\d+;/)
  assert.match(result.code, /contentType = inox_nullable_value_\d+;/)
  assert.match(result.code, /inox_retain\(contentType\);/)
  assert.match(result.code, /inox_object_get_known\(response, 5, &inox_value_\d+\)/)
  assert.match(result.code, /inox_fetch_headers_has\(inox_value_\d+, "x-trace", 7, &hasTrace\)/)
  assert.match(result.code, /inox_object_get_known\(response, 3, &inox_log_value_\d+\)/)
  assert.match(result.code, /inox_object_get_known\(response, 4, &inox_log_value_\d+\)/)
})

test('lowers AbortController signal for fetch init to the C fetch runtime', () => {
  const result = compileSource(
    `const controller = new AbortController()
controller.abort()
const response = await fetch('http://127.0.0.1:9000/slow', { signal: controller.signal })
console.log(response.status)
`,
    cLibuvOptions
  )

  assert.match(result.code, /inox_fetch_abort_controller_new\(&inox_default_allocator, &controller\)/)
  assert.match(result.code, /inox_fetch_abort_controller_abort\(controller\)/)
  assert.match(result.code, /inox_fetch_abort_controller_signal\(controller, &inox_fetch_signal_\d+\)/)
  assert.match(
    result.code,
    /inox_fetch_init inox_fetch_init_\d+ = \{ 0, 0, 0, 0, 0, 0, inox_fetch_signal_\d+, 0, 0 \};/
  )
  assert.match(
    result.code,
    /inox_fetch_with_init\(&inox_loop, "http:\/\/127\.0\.0\.1:9000\/slow", 26, &inox_fetch_init_\d+, &inox_promise_\d+\)/
  )
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
    cLibuvOptions
  )

  assert.match(
    result.code,
    /if \(inox_error\.tag != INOX_TAG_OBJECT \|\| inox_error\.as\.ref == 0\) goto inox_cleanup;/
  )
  assert.match(result.code, /inox_value error = inox_error;/)
  assert.match(result.code, /printf\("%\.\*s: %\.\*s\\n"/)
  assert.match(result.code, /printf\("%s %\.\*s: %\.\*s\\n", "#error:"/)
  assert.doesNotMatch(result.code, /inox_string\* error = \(inox_string\*\)inox_error\.as\.ref;/)
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
    cLibuvOptions
  )

  assert.match(
    result.code,
    /status = inox_fetch_with_init\(inox_loop, "http:\/\/127\.0\.0\.1:9000\/status", 28, &inox_fetch_init_\d+, &frame->awaited\);/
  )
  assert.match(result.code, /inox_fetch_response_text\(inox_loop, response, &inox_promise_\d+\)/)
})

test('reports unsupported fetch init and response body helpers with fetch diagnostics', () => {
  assertDiagnostic(
    `const response = await fetch('http://127.0.0.1:9000/hello', { cache: 'no-store' })
console.log(response.status)
`,
    'INOX_FETCH',
    cLibuvOptions
  )

  assertDiagnostic(
    `const response = await fetch('https://example.test/hello')
console.log(response.status)
`,
    'INOX_FETCH',
    cLibuvOptions
  )

  assertDiagnostic(
    `const response = await fetch('HTTPS://example.test/hello')
console.log(response.status)
`,
    'INOX_FETCH',
    cLibuvOptions
  )

  assertDiagnostic(
    `const response = await fetch('http://127.0.0.1:9000/hello', { redirect: 'same-origin' })
console.log(response.status)
`,
    'INOX_FETCH',
    cLibuvOptions
  )

  assertDiagnostic(
    `const response = await fetch('http://127.0.0.1:9000/hello')
const data = await response.json()
console.log(data)
`,
    'INOX_FETCH',
    cLibuvOptions
  )

  assertDiagnostic(
    `const response = await fetch('http://127.0.0.1:9000/hello')
const data = await response.arrayBuffer()
console.log(data)
`,
    'INOX_FETCH',
    cLibuvOptions
  )

  assertDiagnostic(
    `const response = await fetch('http://127.0.0.1:9000/hello')
console.log(response.body)
`,
    'INOX_FETCH',
    cLibuvOptions
  )
})

test('accepts HTTPS fetch literals when a C TLS backend is enabled', () => {
  const result = compileSource(
    `const response = await fetch('https://example.test/hello')
console.log(response.status)
`,
    {
      ...cLibuvOptions,
      tlsBackend: 'boringssl'
    }
  )

  assert.match(result.code, /inox_fetch\(&inox_loop, "https:\/\/example\.test\/hello", \d+, &inox_promise_\d+\)/)
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
    cLibuvOptions
  )

  assert.match(
    result.code,
    /static inox_status inox_http_handler_\d+\(void\* user, const inox_http_request\* inox_request, inox_http_response\* inox_response\);/
  )
  assert.match(result.code, /inox_http_server_new\(&inox_loop, inox_http_handler_\d+, 0, &server\)/)
  assert.match(result.code, /inox_http_server_listen\(server, "127\.0\.0\.1", \(int\)\(8080\), 128\)/)
  assert.match(result.code, /inox_http_response_write_head\(res, \(int\)\(200\), inox_http_headers_\d+, 1\)/)
  assert.match(result.code, /inox_http_response_end\(res, "\{\\\"data\\\":\\\"Hello World!\\\"\}", 23\)/)
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
    cLibuvOptions
  )

  assert.match(result.code, /inox_http_request_method_equals\(request, "GET", 3\)/)
  assert.match(result.code, /inox_http_request_url_equals\(request, "\/health", 7\)/)
  assert.match(result.code, /inox_http_response_set_status\(response, \(int\)\(204\)\)/)
  assert.match(result.code, /inox_http_response_set_header\(response, "Content-Type", 12, "text\/plain", 10\)/)
  assert.match(result.code, /inox_http_response_write\(response, "missing", 7\)/)
  assert.match(result.code, /inox_http_response_end\(response, request->url, request->url_len\)/)
  assert.match(result.code, /inox_http_server_listen\(server, 0, \(int\)\(9000\), 128\)/)
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
    cLibuvOptions
  )

  assert.match(result.code, /inox_http_server_new\(&inox_loop, 0, 0, &server\)/)
  assert.match(result.code, /inox_http_server_on_request\(server, inox_http_handler_\d+, 0\)/)
  assert.match(result.code, /inox_http_server_listen\(server, "127\.0\.0\.1", \(int\)\(8080\), 128\)/)
  assert.match(result.code, /inox_http_server_close\(server\);/)
})

test('collects node:http global usages when http is referenced', () => {
  const result = compileSource(
    `import http from 'node:http'

export function main(): void {
  const server = http.createServer((request, response) => {
    response.end('ok')
  })
  server.close()
}
`,
    cLibuvOptions
  )

  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.root),
    ['http']
  )
  assert.deepEqual(
    result.ir.globalUsages.map((usage) => usage.path.join('.')),
    ['http.createServer']
  )
  assert.deepEqual(collectIrGlobalRoots([result.ir]), ['http'])
})
