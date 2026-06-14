#ifndef CCJS_NET_H
#define CCJS_NET_H

#include <stddef.h>
#include "ccjs/loop.h"

typedef struct ccjs_net_server ccjs_net_server;
typedef struct ccjs_net_socket ccjs_net_socket;

typedef ccjs_status (*ccjs_net_connection_fn)(void* user, ccjs_net_server* server, ccjs_net_socket* socket);
typedef ccjs_status (*ccjs_net_connect_fn)(void* user, ccjs_net_socket* socket, ccjs_status status);
typedef ccjs_status (*ccjs_net_data_fn)(void* user, ccjs_net_socket* socket, const char* bytes, size_t len);
typedef void (*ccjs_net_close_fn)(void* user, ccjs_net_socket* socket);

ccjs_status ccjs_net_server_new(
  ccjs_loop* loop,
  ccjs_net_connection_fn connection,
  void* user,
  ccjs_net_server** out
);
ccjs_status ccjs_net_server_listen(ccjs_net_server* server, const char* host, int port, int backlog);
ccjs_status ccjs_net_server_local_port(ccjs_net_server* server, int* out_port);
void ccjs_net_server_close(ccjs_net_server* server);

ccjs_status ccjs_net_connect(
  ccjs_loop* loop,
  const char* host,
  int port,
  ccjs_net_connect_fn connect,
  ccjs_net_data_fn data,
  ccjs_net_close_fn close,
  void* user,
  ccjs_net_socket** out
);
void ccjs_net_socket_set_callbacks(
  ccjs_net_socket* socket,
  ccjs_net_data_fn data,
  ccjs_net_close_fn close,
  void* user
);
ccjs_status ccjs_net_socket_read_start(ccjs_net_socket* socket);
ccjs_status ccjs_net_socket_read_stop(ccjs_net_socket* socket);
ccjs_status ccjs_net_socket_write(ccjs_net_socket* socket, const char* bytes, size_t len);
void ccjs_net_socket_close(ccjs_net_socket* socket);

#endif
