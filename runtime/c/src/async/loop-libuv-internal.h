#ifndef CCJS_LOOP_LIBUV_INTERNAL_H
#define CCJS_LOOP_LIBUV_INTERNAL_H

#include <uv.h>
#include "ccjs/loop.h"

uv_loop_t* ccjs_libuv_loop_handle(ccjs_loop* loop);
ccjs_status ccjs_libuv_loop_retain_request(ccjs_loop* loop);
void ccjs_libuv_loop_release_request(ccjs_loop* loop);
void ccjs_libuv_loop_report_status(ccjs_loop* loop, ccjs_status status);

#endif
