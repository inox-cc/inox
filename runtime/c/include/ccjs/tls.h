#ifndef CCJS_TLS_H
#define CCJS_TLS_H

#include <stddef.h>
#include "ccjs/loop.h"

typedef struct ccjs_tls_client ccjs_tls_client;

typedef ccjs_status (*ccjs_tls_connect_fn)(void* user, ccjs_tls_client* client, ccjs_status status);
typedef ccjs_status (*ccjs_tls_data_fn)(void* user, ccjs_tls_client* client, const char* bytes, size_t len);
typedef void (*ccjs_tls_close_fn)(void* user, ccjs_tls_client* client);
typedef ccjs_status (*ccjs_tls_write_fn)(void* user, ccjs_tls_client* client, ccjs_status status);

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
);
ccjs_status ccjs_tls_client_write(ccjs_tls_client* client, const char* bytes, size_t len);
ccjs_status ccjs_tls_client_write_with_callback(
  ccjs_tls_client* client,
  const char* bytes,
  size_t len,
  ccjs_tls_write_fn callback,
  void* user
);
ccjs_status ccjs_tls_client_end(ccjs_tls_client* client, const char* bytes, size_t len);
ccjs_status ccjs_tls_client_end_with_callback(
  ccjs_tls_client* client,
  const char* bytes,
  size_t len,
  ccjs_tls_write_fn callback,
  void* user
);
ccjs_status ccjs_tls_client_destroy(ccjs_tls_client* client);
void ccjs_tls_client_close(ccjs_tls_client* client);

#endif
