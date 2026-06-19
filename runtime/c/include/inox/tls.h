#ifndef INOX_TLS_H
#define INOX_TLS_H

#include <stddef.h>
#include "inox/loop.h"

typedef struct inox_tls_client inox_tls_client;

typedef inox_status (*inox_tls_connect_fn)(void* user, inox_tls_client* client, inox_status status);
typedef inox_status (*inox_tls_data_fn)(void* user, inox_tls_client* client, const char* bytes, size_t len);
typedef void (*inox_tls_close_fn)(void* user, inox_tls_client* client);
typedef inox_status (*inox_tls_write_fn)(void* user, inox_tls_client* client, inox_status status);

inox_status inox_tls_connect(
  inox_loop* loop,
  const char* host,
  int port,
  const char* servername,
  inox_tls_connect_fn connect,
  inox_tls_data_fn data,
  inox_tls_close_fn close,
  void* user,
  inox_tls_client** out
);
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

#endif
