#ifndef INOX_TLS_H
#define INOX_TLS_H

#include <stddef.h>
#include "inox/loop.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct inox_tls_client inox_tls_client;
typedef struct inox_tls_server inox_tls_server;
typedef struct inox_tls_server_connection inox_tls_server_connection;

typedef inox_status (*inox_tls_connect_fn)(void* user, inox_tls_client* client, inox_status status);
typedef inox_status (*inox_tls_data_fn)(void* user, inox_tls_client* client, const char* bytes, size_t len);
typedef void (*inox_tls_close_fn)(void* user, inox_tls_client* client);
typedef inox_status (*inox_tls_write_fn)(void* user, inox_tls_client* client, inox_status status);
typedef inox_status (*inox_tls_server_handshake_fn)(
  void* user,
  inox_tls_server_connection* connection,
  inox_status status
);
typedef inox_status (*inox_tls_server_data_fn)(
  void* user,
  inox_tls_server_connection* connection,
  const char* bytes,
  size_t len
);
typedef inox_status (*inox_tls_server_error_fn)(
  void* user,
  inox_tls_server_connection* connection,
  inox_status status
);
typedef void (*inox_tls_server_close_fn)(
  void* user,
  inox_tls_server_connection* connection
);

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
);
inox_status inox_tls_client_socket(inox_tls_client* client, inox_value* out);
inox_status inox_tls_client_write(inox_tls_client* client, const char* bytes, size_t len);
inox_status inox_tls_client_write_with_callback(
  inox_tls_client* client,
  const char* bytes,
  size_t len,
  inox_tls_write_fn callback,
  void* user
);
inox_status inox_tls_client_end(inox_tls_client* client, const char* bytes, size_t len);
inox_status inox_tls_client_end_with_callback(
  inox_tls_client* client,
  const char* bytes,
  size_t len,
  inox_tls_write_fn callback,
  void* user
);
inox_status inox_tls_client_destroy(inox_tls_client* client);
void inox_tls_client_close(inox_tls_client* client);

inox_status inox_tls_server_create(
  inox_loop* loop,
  const char* certificate,
  size_t certificate_len,
  const char* private_key,
  size_t private_key_len,
  inox_tls_server** out
);
void inox_tls_server_destroy(inox_tls_server* server);
inox_status inox_tls_server_accept(
  inox_tls_server* server,
  inox_value socket,
  inox_tls_server_handshake_fn handshake,
  inox_tls_server_data_fn data,
  inox_tls_server_error_fn error,
  inox_tls_server_close_fn close,
  void* user,
  inox_tls_server_connection** out
);
inox_status inox_tls_server_connection_socket(
  inox_tls_server_connection* connection,
  inox_value* out
);
inox_status inox_tls_server_connection_write(
  inox_tls_server_connection* connection,
  const char* bytes,
  size_t len
);
inox_status inox_tls_server_connection_shutdown(inox_tls_server_connection* connection);
inox_status inox_tls_server_connection_destroy(inox_tls_server_connection* connection);

#ifdef __cplusplus
}
#endif

#endif
