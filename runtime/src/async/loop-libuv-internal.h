#ifndef INOX_LOOP_LIBUV_INTERNAL_H
#define INOX_LOOP_LIBUV_INTERNAL_H

#include <uv.h>
#include "inox/loop.h"

#ifdef __cplusplus
extern "C" {
#endif

uv_loop_t* inox_libuv_loop_handle(inox_loop* loop);
typedef void (*inox_libuv_external_handle_close_fn)(void* context);
inox_status inox_libuv_loop_register_external_handle(
  inox_loop* loop,
  void* context,
  inox_libuv_external_handle_close_fn close
);
void inox_libuv_loop_unregister_external_handle(inox_loop* loop, void* context);
inox_status inox_libuv_loop_retain_request(inox_loop* loop);
void inox_libuv_loop_release_request(inox_loop* loop);
void inox_libuv_loop_report_status(inox_loop* loop, inox_status status);

#ifdef __cplusplus
}
#endif

#endif
