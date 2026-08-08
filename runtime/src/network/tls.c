#include "inox/tls.h"

struct inox_tls_client {
  int unused;
};

inox_status inox_tls_connect(
  inox_loop* loop,
  const char* host,
  int port,
  const char* servername,
  int verify_peer,
  inox_tls_connect_fn connect,
  inox_tls_data_fn data,
  inox_tls_close_fn close,
  void* user,
  inox_tls_client** out
) {
  (void)loop;
  (void)host;
  (void)port;
  (void)servername;
  (void)verify_peer;
  (void)connect;
  (void)data;
  (void)close;
  (void)user;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_tls_client_socket(inox_tls_client* client, inox_value* out) {
  (void)client;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_tls_client_write(inox_tls_client* client, const char* bytes, size_t len) {
  (void)client;
  (void)bytes;
  (void)len;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_tls_client_write_with_callback(
  inox_tls_client* client,
  const char* bytes,
  size_t len,
  inox_tls_write_fn callback,
  void* user
) {
  (void)client;
  (void)bytes;
  (void)len;
  (void)callback;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_tls_client_end(inox_tls_client* client, const char* bytes, size_t len) {
  return inox_tls_client_end_with_callback(client, bytes, len, 0, 0);
}

inox_status inox_tls_client_end_with_callback(
  inox_tls_client* client,
  const char* bytes,
  size_t len,
  inox_tls_write_fn callback,
  void* user
) {
  (void)client;
  (void)bytes;
  (void)len;
  (void)callback;
  (void)user;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_tls_client_destroy(inox_tls_client* client) {
  if (client == 0) {
    return INOX_ERR_TYPE;
  }

  inox_tls_client_close(client);
  return INOX_OK;
}

void inox_tls_client_close(inox_tls_client* client) {
  (void)client;
}
