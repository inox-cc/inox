#include "inox/tls.h"

struct inox_tls_client {
  int unused;
};

struct inox_tls_server {
  int unused;
};

struct inox_tls_server_connection {
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

inox_status inox_tls_server_create(
  inox_loop* loop,
  const char* certificate,
  size_t certificate_len,
  const char* private_key,
  size_t private_key_len,
  inox_tls_server** out
) {
  (void)loop;
  (void)certificate;
  (void)certificate_len;
  (void)private_key;
  (void)private_key_len;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  return INOX_ERR_UNSUPPORTED;
}

void inox_tls_server_destroy(inox_tls_server* server) {
  (void)server;
}

inox_status inox_tls_server_accept(
  inox_tls_server* server,
  inox_value socket,
  inox_tls_server_handshake_fn handshake,
  inox_tls_server_data_fn data,
  inox_tls_server_error_fn error,
  inox_tls_server_close_fn close,
  void* user,
  inox_tls_server_connection** out
) {
  (void)server;
  (void)socket;
  (void)handshake;
  (void)data;
  (void)error;
  (void)close;
  (void)user;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = 0;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_tls_server_connection_socket(
  inox_tls_server_connection* connection,
  inox_value* out
) {
  (void)connection;

  if (out == 0) {
    return INOX_ERR_TYPE;
  }

  *out = inox_undefined_value();
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_tls_server_connection_write(
  inox_tls_server_connection* connection,
  const char* bytes,
  size_t len
) {
  (void)connection;
  (void)bytes;
  (void)len;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_tls_server_connection_shutdown(inox_tls_server_connection* connection) {
  (void)connection;
  return INOX_ERR_UNSUPPORTED;
}

inox_status inox_tls_server_connection_destroy(inox_tls_server_connection* connection) {
  (void)connection;
  return INOX_ERR_UNSUPPORTED;
}
