import test from 'node:test'
import {
  assert,
  compileRuntimeProgram,
  compileSource,
  generateLocalhostCertificate,
  isLocalListenUnavailable,
  join,
  mkdir,
  mkdtemp,
  readFile,
  repoRoot,
  rm,
  runCommand,
  startLocalTlsServer,
  tmpdir,
  writeFile
} from '../helpers/runtime-c.ts'



test('C runtime TLS fallback reports unsupported backend', async (t) => {
  const probe = await runCommand('cc', ['--version'])

  if (probe.code !== 0) {
    t.skip('cc is not available')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-tls-runtime-'))
  const source = join(dir, 'tls-runtime.c')
  const output = join(dir, 'tls-runtime')

  try {
    await writeFile(
      source,
      `#include <stdio.h>
#include "ccjs/tls.h"

static ccjs_status on_connect(void* user, ccjs_tls_client* client, ccjs_status status) {
  (void)user;
  (void)client;
  (void)status;
  return CCJS_OK;
}

static ccjs_status on_data(void* user, ccjs_tls_client* client, const char* bytes, size_t len) {
  (void)user;
  (void)client;
  (void)bytes;
  (void)len;
  return CCJS_OK;
}

static void on_close(void* user, ccjs_tls_client* client) {
  (void)user;
  (void)client;
}

int main(void) {
  ccjs_loop loop = { 0 };
  ccjs_tls_client* client = (ccjs_tls_client*)1;

  if (ccjs_tls_connect(&loop, "example.test", 443, "example.test", on_connect, on_data, on_close, 0, &client) != CCJS_ERR_UNSUPPORTED) return 1;
  if (client != 0) return 2;
  if (ccjs_tls_connect(&loop, "example.test", 443, "example.test", on_connect, on_data, on_close, 0, 0) != CCJS_ERR_TYPE) return 3;

  printf("tls unsupported\\n");
  return 0;
}
`
    )

    const compile = await runCommand('cc', [
      '-Iruntime/c/include',
      source,
      'runtime/c/src/network/tls.c',
      '-o',
      output
    ])

    assert.equal(compile.code, 0, compile.stderr)

    const run = await runCommand(output, [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, 'tls unsupported\n')
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('C runtime BoringSSL TLS client connects to local TLS server', async (t) => {
  if (process.env.CCJS_TEST_BORINGSSL_TLS !== '1') {
    t.skip('set CCJS_TEST_BORINGSSL_TLS=1 to build BoringSSL TLS integration smoke')
    return
  }

  const cc = await runCommand('cc', ['--version'])
  const cmake = await runCommand('cmake', ['--version'])
  const openssl = await runCommand('openssl', ['version'])

  if (cc.code !== 0 || cmake.code !== 0 || openssl.code !== 0) {
    t.skip('cc, cmake and openssl are required')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-boringssl-runtime-'))
  const buildDir = join(dir, 'build')
  const goodKey = join(dir, 'good-key.pem')
  const goodCert = join(dir, 'good-cert.pem')
  const badKey = join(dir, 'bad-key.pem')
  const badCert = join(dir, 'bad-cert.pem')
  const source = join(dir, 'tls-client.c')

  try {
    await generateLocalhostCertificate(goodKey, goodCert)
    await generateLocalhostCertificate(badKey, badCert)
    await writeFile(
      join(dir, 'CMakeLists.txt'),
      `cmake_minimum_required(VERSION 3.22)
project(ccjs_tls_smoke C CXX)

add_subdirectory("${repoRoot}/runtime/c" ccjs_runtime_build)
add_executable(tls-client tls-client.c)
set_property(TARGET tls-client PROPERTY LINKER_LANGUAGE CXX)
target_link_libraries(tls-client PRIVATE ccjs_runtime)
`
    )
    await writeFile(
      source,
      `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "ccjs/allocator.h"
#include "ccjs/loop.h"
#include "ccjs/tls.h"

typedef struct tls_state {
  ccjs_tls_client* client;
  char response[4096];
  size_t response_len;
  int done;
  ccjs_status status;
} tls_state;

static void* test_alloc(void* user, size_t size, size_t align) {
  (void)user;
  (void)align;
  return calloc(1, size);
}

static void* test_realloc(void* user, void* ptr, size_t old_size, size_t new_size, size_t align) {
  (void)user;
  (void)old_size;
  (void)align;
  return realloc(ptr, new_size);
}

static void test_free(void* user, void* ptr, size_t size, size_t align) {
  (void)user;
  (void)size;
  (void)align;
  free(ptr);
}

static ccjs_status on_connect(void* user, ccjs_tls_client* client, ccjs_status status) {
  tls_state* state = (tls_state*)user;
  state->client = client;

  if (status != CCJS_OK) {
    state->status = status;
    state->done = 1;
    return CCJS_OK;
  }

  const char request[] = "GET / HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n";
  return ccjs_tls_client_write(client, request, sizeof(request) - 1);
}

static ccjs_status on_data(void* user, ccjs_tls_client* client, const char* bytes, size_t len) {
  tls_state* state = (tls_state*)user;

  if (state->response_len + len >= sizeof(state->response)) {
    state->status = CCJS_ERR_UNSUPPORTED;
    state->done = 1;
    ccjs_tls_client_close(client);
    return CCJS_OK;
  }

  memcpy(state->response + state->response_len, bytes, len);
  state->response_len += len;
  state->response[state->response_len] = '\\0';

  if (strstr(state->response, "\\r\\n\\r\\nok") != 0) {
    state->status = CCJS_OK;
    state->done = 1;
    ccjs_tls_client_close(client);
  }

  return CCJS_OK;
}

static void on_close(void* user, ccjs_tls_client* client) {
  (void)client;
  tls_state* state = (tls_state*)user;

  if (!state->done) {
    state->status = CCJS_ERR_FIELD;
    state->done = 1;
  }
}

int main(int argc, char** argv) {
  if (argc != 2) return 2;

  ccjs_allocator allocator = { 0, test_alloc, test_realloc, test_free };
  ccjs_loop loop;
  tls_state state = { 0 };
  state.status = CCJS_ERR_FIELD;

  if (ccjs_loop_init(&loop, &allocator) != CCJS_OK) return 3;

  ccjs_status status = ccjs_tls_connect(
    &loop,
    "127.0.0.1",
    atoi(argv[1]),
    "localhost",
    on_connect,
    on_data,
    on_close,
    &state,
    &state.client
  );

  if (status != CCJS_OK) {
    ccjs_loop_dispose(&loop);
    return 4;
  }

  for (int spin = 0; !state.done && ccjs_loop_has_work(&loop) && spin < 1000000; spin += 1) {
    status = ccjs_loop_poll(&loop, 0);

    if (status != CCJS_OK) {
      state.status = status;
      state.done = 1;
    }
  }

  if (!state.done) {
    state.status = CCJS_ERR_FIELD;
    if (state.client != 0) ccjs_tls_client_close(state.client);
  }

  ccjs_loop_dispose(&loop);

  if (state.status != CCJS_OK) {
    printf("status %d\\n", (int)state.status);
    return 10 + (int)state.status;
  }

  printf("%s", state.response);
  return strstr(state.response, "ok") == 0 ? 20 : 0;
}
`
    )

    const configure = await runCommand('cmake', [
      '-S',
      dir,
      '-B',
      buildDir,
      '-DCCJS_LOOP_BACKEND=libuv',
      '-DCCJS_TLS_BACKEND=boringssl',
      `-DCCJS_TLS_CA_BUNDLE=${goodCert}`
    ])

    assert.equal(configure.code, 0, configure.stderr)

    const build = await runCommand('cmake', ['--build', buildDir, '--target', 'tls-client'])

    assert.equal(build.code, 0, build.stderr)

    let goodServer

    try {
      goodServer = await startLocalTlsServer(goodKey, goodCert)
    } catch (error) {
      if (isLocalListenUnavailable(error)) {
        t.skip('local TLS listen is not permitted in this environment')
        return
      }

      throw error
    }

    try {
      const run = await runCommand(join(buildDir, 'tls-client'), [String(goodServer.port)])

      assert.equal(run.code, 0, run.stderr)
      assert.match(run.stdout, /HTTP\/1\.1 200 OK/)
      assert.match(run.stdout, /\r?\n\r?\nok/)
    } finally {
      await goodServer.close()
    }

    const badServer = await startLocalTlsServer(badKey, badCert)

    try {
      const run = await runCommand(join(buildDir, 'tls-client'), [String(badServer.port)])

      assert.notEqual(run.code, 0)
      assert.match(run.stdout, /status/)
    } finally {
      await badServer.close()
    }
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('generated C fetch uses BoringSSL TLS for HTTPS URLs', async (t) => {
  if (process.env.CCJS_TEST_BORINGSSL_FETCH !== '1') {
    t.skip('set CCJS_TEST_BORINGSSL_FETCH=1 to build BoringSSL HTTPS fetch smoke')
    return
  }

  const cc = await runCommand('cc', ['--version'])
  const cmake = await runCommand('cmake', ['--version'])
  const openssl = await runCommand('openssl', ['version'])

  if (cc.code !== 0 || cmake.code !== 0 || openssl.code !== 0) {
    t.skip('cc, cmake and openssl are required')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-boringssl-fetch-'))
  const buildDir = join(dir, 'build')
  const key = join(dir, 'key.pem')
  const cert = join(dir, 'cert.pem')
  let server: { port: number; close: () => Promise<void> } | null = null

  try {
    await generateLocalhostCertificate(key, cert)

    try {
      server = await startLocalTlsServer(key, cert)
    } catch (error) {
      if (isLocalListenUnavailable(error)) {
        t.skip('local TLS listen is not permitted in this environment')
        return
      }

      throw error
    }

    const result = compileSource(
      `const response = await fetch('https://localhost:${server.port}/')
const text = await response.text()
console.log(response.status, text)
`,
      {
        target: 'c',
        loopBackend: 'libuv',
        tlsBackend: 'boringssl'
      }
    )

    await writeFile(join(dir, 'main.c'), result.code)
    await writeFile(
      join(dir, 'CMakeLists.txt'),
      `cmake_minimum_required(VERSION 3.22)
project(ccjs_https_fetch_smoke C CXX)

add_subdirectory("${repoRoot}/runtime/c" ccjs_runtime_build)
add_executable(fetch-client main.c)
set_property(TARGET fetch-client PROPERTY LINKER_LANGUAGE CXX)
target_link_libraries(fetch-client PRIVATE ccjs_runtime)
`
    )

    const configure = await runCommand('cmake', [
      '-S',
      dir,
      '-B',
      buildDir,
      '-DCCJS_LOOP_BACKEND=libuv',
      '-DCCJS_TLS_BACKEND=boringssl',
      `-DCCJS_TLS_CA_BUNDLE=${cert}`
    ])

    assert.equal(configure.code, 0, configure.stderr)

    const build = await runCommand('cmake', ['--build', buildDir, '--target', 'fetch-client'])

    assert.equal(build.code, 0, build.stderr)

    const run = await runCommand(join(buildDir, 'fetch-client'), [])

    assert.equal(run.code, 0, run.stderr)
    assert.equal(run.stdout, '200 ok\n')
  } finally {
    if (server != null) {
      await server.close()
    }

    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})


test('C runtime OpenSSL TLS backend builds when available', async (t) => {
  if (process.env.CCJS_TEST_OPENSSL_TLS !== '1') {
    t.skip('set CCJS_TEST_OPENSSL_TLS=1 to build OpenSSL TLS backend smoke')
    return
  }

  const cmake = await runCommand('cmake', ['--version'])

  if (cmake.code !== 0) {
    t.skip('cmake is required')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'ccjs-c-openssl-runtime-'))
  const buildDir = join(dir, 'build')

  try {
    await writeFile(
      join(dir, 'CMakeLists.txt'),
      `cmake_minimum_required(VERSION 3.20)
project(ccjs_openssl_smoke C)

add_subdirectory("${repoRoot}/runtime/c" ccjs_runtime_build)
`
    )

    const configure = await runCommand('cmake', [
      '-S',
      dir,
      '-B',
      buildDir,
      '-DCCJS_LOOP_BACKEND=libuv',
      '-DCCJS_TLS_BACKEND=openssl'
    ])

    if (configure.code !== 0 && /Could NOT find OpenSSL|OpenSSL.*NOTFOUND/i.test(configure.stderr)) {
      t.skip('OpenSSL was not found by CMake')
      return
    }

    assert.equal(configure.code, 0, configure.stderr)

    const build = await runCommand('cmake', ['--build', buildDir, '--target', 'ccjs_runtime'])

    assert.equal(build.code, 0, build.stderr)
  } finally {
    await rm(dir, {
      recursive: true,
      force: true
    })
  }
})
