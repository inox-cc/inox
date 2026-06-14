#ifndef CCJS_DGRAM_H
#define CCJS_DGRAM_H

#include <stddef.h>
#include "ccjs/loop.h"

typedef struct ccjs_dgram_socket ccjs_dgram_socket;

typedef struct ccjs_dgram_address {
  char address[64];
  const char* family;
  int port;
} ccjs_dgram_address;

typedef ccjs_status (*ccjs_dgram_recv_fn)(
  void* user,
  ccjs_dgram_socket* socket,
  const char* bytes,
  size_t len,
  const char* host,
  int port
);
typedef ccjs_status (*ccjs_dgram_send_fn)(void* user, ccjs_status status);
typedef void (*ccjs_dgram_close_fn)(void* user, ccjs_dgram_socket* socket);

#define CCJS_DGRAM_BIND_REUSEADDR 1u

ccjs_status ccjs_dgram_socket_new(
  ccjs_loop* loop,
  ccjs_dgram_recv_fn recv,
  void* user,
  ccjs_dgram_socket** out
);
ccjs_status ccjs_dgram_bind(ccjs_dgram_socket* socket, const char* host, int port);
ccjs_status ccjs_dgram_bind_flags(ccjs_dgram_socket* socket, const char* host, int port, unsigned int flags);
ccjs_status ccjs_dgram_socket_on_message(ccjs_dgram_socket* socket, ccjs_dgram_recv_fn recv, void* user);
ccjs_status ccjs_dgram_socket_on_close(ccjs_dgram_socket* socket, ccjs_dgram_close_fn close, void* user);
ccjs_status ccjs_dgram_socket_connect(ccjs_dgram_socket* socket, const char* host, int port);
ccjs_status ccjs_dgram_socket_disconnect(ccjs_dgram_socket* socket);
ccjs_status ccjs_dgram_recv_start(ccjs_dgram_socket* socket);
ccjs_status ccjs_dgram_recv_stop(ccjs_dgram_socket* socket);
ccjs_status ccjs_dgram_send(ccjs_dgram_socket* socket, const char* bytes, size_t len, const char* host, int port);
ccjs_status ccjs_dgram_send_with_callback(
  ccjs_dgram_socket* socket,
  const char* bytes,
  size_t len,
  const char* host,
  int port,
  ccjs_dgram_send_fn callback,
  void* user
);
ccjs_status ccjs_dgram_send_connected(ccjs_dgram_socket* socket, const char* bytes, size_t len);
ccjs_status ccjs_dgram_send_connected_with_callback(
  ccjs_dgram_socket* socket,
  const char* bytes,
  size_t len,
  ccjs_dgram_send_fn callback,
  void* user
);
ccjs_status ccjs_dgram_socket_address(ccjs_dgram_socket* socket, ccjs_dgram_address* out);
ccjs_status ccjs_dgram_socket_remote_address(ccjs_dgram_socket* socket, ccjs_dgram_address* out);
ccjs_status ccjs_dgram_local_port(ccjs_dgram_socket* socket, int* out_port);
ccjs_status ccjs_dgram_set_broadcast(ccjs_dgram_socket* socket, int enabled);
ccjs_status ccjs_dgram_set_ttl(ccjs_dgram_socket* socket, int ttl);
ccjs_status ccjs_dgram_get_send_buffer_size(ccjs_dgram_socket* socket, int* out_size);
ccjs_status ccjs_dgram_set_send_buffer_size(ccjs_dgram_socket* socket, int size);
ccjs_status ccjs_dgram_get_recv_buffer_size(ccjs_dgram_socket* socket, int* out_size);
ccjs_status ccjs_dgram_set_recv_buffer_size(ccjs_dgram_socket* socket, int size);
ccjs_status ccjs_dgram_ref(ccjs_dgram_socket* socket);
ccjs_status ccjs_dgram_unref(ccjs_dgram_socket* socket);
void ccjs_dgram_close(ccjs_dgram_socket* socket);

#endif
