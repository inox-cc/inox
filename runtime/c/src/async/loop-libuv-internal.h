#ifndef INOX_LOOP_LIBUV_INTERNAL_H
#define INOX_LOOP_LIBUV_INTERNAL_H

#include <uv.h>
#include "inox/loop.h"

uv_loop_t* inox_libuv_loop_handle(inox_loop* loop);
inox_status inox_libuv_loop_retain_request(inox_loop* loop);
void inox_libuv_loop_release_request(inox_loop* loop);
void inox_libuv_loop_report_status(inox_loop* loop, inox_status status);

#endif
