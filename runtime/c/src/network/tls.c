#include "ccjs/tls.h"

struct ccjs_tls_client {
  int unused;
};

ccjs_status ccjs_tls_connect(
  ccjs_loop* loop,
  const char* host,
  int port,
  const char* servername,
  ccjs_tls_connect_fn connect,
  ccjs_tls_data_fn data,
  ccjs_tls_close_fn close,
  void* user,
  ccjs_tls_client** out
) {
  (void)loop;
  (void)host;
  (void)port;
  (void)servername;
  (void)connect;
  (void)data;
  (void)close;
  (void)user;

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_tls_client_write(ccjs_tls_client* client, const char* bytes, size_t len) {
  (void)client;
  (void)bytes;
  (void)len;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_tls_client_write_with_callback(
  ccjs_tls_client* client,
  const char* bytes,
  size_t len,
  ccjs_tls_write_fn callback,
  void* user
) {
  (void)client;
  (void)bytes;
  (void)len;
  (void)callback;
  (void)user;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_tls_client_end(ccjs_tls_client* client, const char* bytes, size_t len) {
  return ccjs_tls_client_end_with_callback(client, bytes, len, 0, 0);
}

ccjs_status ccjs_tls_client_end_with_callback(
  ccjs_tls_client* client,
  const char* bytes,
  size_t len,
  ccjs_tls_write_fn callback,
  void* user
) {
  (void)client;
  (void)bytes;
  (void)len;
  (void)callback;
  (void)user;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_tls_client_destroy(ccjs_tls_client* client) {
  if (client == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_tls_client_close(client);
  return CCJS_OK;
}

void ccjs_tls_client_close(ccjs_tls_client* client) {
  (void)client;
}
