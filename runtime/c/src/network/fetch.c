#include "ccjs/fetch.h"

#ifdef CCJS_LOOP_BACKEND_LIBUV
#include "ccjs/net.h"
#include "ccjs/object.h"
#include "ccjs/string.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct ccjs_fetch_operation {
  ccjs_loop* loop;
  ccjs_allocator* allocator;
  ccjs_net_socket* socket;
  ccjs_timer_handle* abort_timer;
  ccjs_fetch_done_fn done;
  void* user;
  ccjs_value signal;
  char url[1024];
  size_t url_len;
  char host[256];
  char path[512];
  char request[4096];
  size_t request_len;
  int port;
  int redirect_mode;
  int redirect_count;
  int redirected;
  int replayable;
  int waiting_redirect_close;
  char response[8192];
  size_t response_len;
  int completed;
} ccjs_fetch_operation;

typedef struct ccjs_fetch_promise_request {
  ccjs_loop* loop;
  ccjs_promise* promise;
  char* url;
  size_t url_len;
} ccjs_fetch_promise_request;

enum {
  CCJS_FETCH_RESPONSE_STATUS_INDEX = 0,
  CCJS_FETCH_RESPONSE_OK_INDEX = 1,
  CCJS_FETCH_RESPONSE_URL_INDEX = 2,
  CCJS_FETCH_RESPONSE_STATUS_TEXT_INDEX = 3,
  CCJS_FETCH_RESPONSE_REDIRECTED_INDEX = 4,
  CCJS_FETCH_RESPONSE_HEADERS_INDEX = 5,
  CCJS_FETCH_RESPONSE_BODY_INDEX = 6
};

enum {
  CCJS_FETCH_HEADERS_RAW_INDEX = 0
};

enum {
  CCJS_FETCH_ABORT_CONTROLLER_SIGNAL_INDEX = 0,
  CCJS_FETCH_ABORT_SIGNAL_ABORTED_INDEX = 0
};

enum {
  CCJS_FETCH_REDIRECT_FOLLOW = 0,
  CCJS_FETCH_REDIRECT_ERROR = 1,
  CCJS_FETCH_REDIRECT_MANUAL = 2
};

#define CCJS_FETCH_MAX_REDIRECTS 20

static ccjs_status ccjs_fetch_parse_url(const char* url, char* host, size_t host_len, int* port, char* path, size_t path_len);
static ccjs_status ccjs_fetch_copy_url(ccjs_allocator* allocator, const char* url, size_t url_len, char** out);
static ccjs_status ccjs_fetch_set_url(ccjs_fetch_operation* request, const char* url);
static ccjs_status ccjs_fetch_build_request(ccjs_fetch_operation* request, const ccjs_fetch_init* init);
static ccjs_status ccjs_fetch_start_connection(ccjs_fetch_operation* request);
static ccjs_status ccjs_fetch_operation_is_aborted(ccjs_fetch_operation* request, int* out);
static void ccjs_fetch_operation_free(ccjs_fetch_operation* request);
static ccjs_status ccjs_fetch_append_bytes(char* out, size_t out_size, size_t* offset, const char* bytes, size_t len);
static ccjs_status ccjs_fetch_append_cstr(char* out, size_t out_size, size_t* offset, const char* text);
static ccjs_status ccjs_fetch_append_size(char* out, size_t out_size, size_t* offset, size_t value);
static int ccjs_fetch_header_name_equals(const char* name, size_t name_len, const char* expected);
static int ccjs_fetch_headers_include(const ccjs_fetch_header* headers, size_t header_count, const char* name);
static ccjs_status ccjs_fetch_redirect_mode_from_init(const ccjs_fetch_init* init, int* out);
static ccjs_status ccjs_fetch_on_connect(void* user, ccjs_net_socket* socket, ccjs_status status);
static ccjs_status ccjs_fetch_on_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len);
static void ccjs_fetch_on_close(void* user, ccjs_net_socket* socket);
static ccjs_status ccjs_fetch_abort_poll(void* user);
static ccjs_status ccjs_fetch_try_complete(ccjs_fetch_operation* request);
static const char* ccjs_fetch_find_header_end(const char* bytes, size_t len);
static int ccjs_fetch_parse_status_line(
  const char* bytes,
  size_t len,
  int* status,
  const char** status_text,
  size_t* status_text_len
);
static int ccjs_fetch_parse_content_length(const char* bytes, size_t header_len, size_t* out);
static int ccjs_fetch_find_header_value(
  const char* bytes,
  size_t header_len,
  const char* name,
  size_t name_len,
  const char** value,
  size_t* value_len
);
static int ccjs_fetch_is_redirect_status(int status);
static ccjs_status ccjs_fetch_resolve_redirect_url(
  ccjs_fetch_operation* request,
  const char* location,
  size_t location_len,
  char* out,
  size_t out_len
);
static ccjs_status ccjs_fetch_follow_redirect(ccjs_fetch_operation* request, const char* location, size_t location_len);
static ccjs_status ccjs_fetch_finish(ccjs_fetch_operation* request, ccjs_status status, const ccjs_fetch_response* response);
static ccjs_status ccjs_fetch_promise_done(void* user, ccjs_status status, const ccjs_fetch_response* response);
static ccjs_status ccjs_fetch_response_new(
  ccjs_allocator* allocator,
  const char* url,
  size_t url_len,
  const ccjs_fetch_response* response,
  ccjs_value* out
);
static ccjs_status ccjs_fetch_headers_new(ccjs_allocator* allocator, const char* headers, size_t headers_len, ccjs_value* out);
static ccjs_status ccjs_fetch_headers_raw(ccjs_value headers, ccjs_value* out);
static ccjs_status ccjs_fetch_reject_status(ccjs_loop* loop, ccjs_promise* promise, ccjs_status status);
static ccjs_status ccjs_fetch_error_from_status(ccjs_allocator* allocator, ccjs_status status, ccjs_value* out);
static ccjs_status ccjs_fetch_error_field(
  ccjs_allocator* allocator,
  ccjs_value error,
  uint32_t index,
  const char* value,
  size_t value_len
);
static const char* ccjs_fetch_error_message(ccjs_status status);
static void ccjs_fetch_promise_request_free(ccjs_fetch_promise_request* request);

ccjs_status ccjs_fetch_get(ccjs_loop* loop, const char* url, ccjs_fetch_done_fn done, void* user) {
  return ccjs_fetch_request(loop, url, 0, done, user);
}

ccjs_status ccjs_fetch_request(ccjs_loop* loop, const char* url, const ccjs_fetch_init* init, ccjs_fetch_done_fn done, void* user) {
  if (loop == 0 || loop->allocator == 0 || url == 0 || done == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_allocator* allocator = loop->allocator;
  ccjs_fetch_operation* request =
    allocator->alloc(allocator->user, sizeof(ccjs_fetch_operation), _Alignof(ccjs_fetch_operation));

  if (request == 0) {
    return CCJS_ERR_OOM;
  }

  memset(request, 0, sizeof(ccjs_fetch_operation));
  request->loop = loop;
  request->allocator = allocator;
  request->done = done;
  request->user = user;
  request->signal = ccjs_undefined_value();
  request->redirect_mode = CCJS_FETCH_REDIRECT_FOLLOW;
  request->replayable = 1;

  ccjs_status status = ccjs_fetch_set_url(request, url);

  if (status != CCJS_OK) {
    ccjs_fetch_operation_free(request);
    return status;
  }

  status = ccjs_fetch_build_request(request, init);

  if (status != CCJS_OK) {
    ccjs_fetch_operation_free(request);
    return status;
  }

  int aborted = 0;
  status = ccjs_fetch_operation_is_aborted(request, &aborted);

  if (status != CCJS_OK) {
    ccjs_fetch_operation_free(request);
    return status;
  }

  if (aborted) {
    ccjs_fetch_operation_free(request);
    return CCJS_ERR_THROW;
  }

  if (request->signal.tag != CCJS_TAG_UNDEFINED && request->signal.tag != CCJS_TAG_NULL) {
    status = ccjs_loop_set_interval(loop, 1, ccjs_fetch_abort_poll, request, 0, &request->abort_timer);

    if (status != CCJS_OK) {
      ccjs_fetch_operation_free(request);
      return status;
    }
  }

  status = ccjs_fetch_start_connection(request);

  if (status != CCJS_OK) {
    if (request->abort_timer != 0) {
      ccjs_loop_clear_timer(request->abort_timer);
      request->abort_timer = 0;
    }

    ccjs_fetch_operation_free(request);
    return status;
  }

  return CCJS_OK;
}

ccjs_status ccjs_fetch(ccjs_loop* loop, const char* url, size_t url_len, ccjs_promise** out) {
  return ccjs_fetch_with_init(loop, url, url_len, 0, out);
}

ccjs_status ccjs_fetch_with_init(
  ccjs_loop* loop,
  const char* url,
  size_t url_len,
  const ccjs_fetch_init* init,
  ccjs_promise** out
) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  if (loop == 0 || loop->allocator == 0 || url == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_promise* promise = 0;
  ccjs_status status = ccjs_promise_new(loop, &promise);

  if (status != CCJS_OK) {
    return status;
  }

  ccjs_allocator* allocator = loop->allocator;
  ccjs_fetch_promise_request* request =
    allocator->alloc(allocator->user, sizeof(ccjs_fetch_promise_request), _Alignof(ccjs_fetch_promise_request));

  if (request == 0) {
    ccjs_promise_release(promise);
    return CCJS_ERR_OOM;
  }

  memset(request, 0, sizeof(ccjs_fetch_promise_request));
  request->loop = loop;
  request->promise = promise;
  request->url_len = url_len;
  ccjs_promise_retain(promise);

  status = ccjs_fetch_copy_url(allocator, url, url_len, &request->url);

  if (status == CCJS_OK) {
    status = ccjs_fetch_request(loop, request->url, init, ccjs_fetch_promise_done, request);
  }

  if (status != CCJS_OK) {
    ccjs_status reject_status = ccjs_fetch_reject_status(loop, promise, status);
    ccjs_fetch_promise_request_free(request);

    if (reject_status != CCJS_OK) {
      ccjs_promise_release(promise);
      return reject_status;
    }
  }

  *out = promise;

  return CCJS_OK;
}

ccjs_status ccjs_fetch_response_text(ccjs_loop* loop, ccjs_value response, ccjs_promise** out) {
  if (loop == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  ccjs_value body = ccjs_undefined_value();
  ccjs_status status = ccjs_object_get(response, "__ccjsBody", 10, &body);

  if (status != CCJS_OK) {
    return status;
  }

  if (body.tag != CCJS_TAG_STRING || body.as.ref == 0) {
    ccjs_release(body);
    return CCJS_ERR_TYPE;
  }

  status = ccjs_promise_resolved(loop, body, out);
  ccjs_release(body);

  return status;
}

ccjs_status ccjs_fetch_headers_get(ccjs_allocator* allocator, ccjs_value headers, const char* name, size_t name_len, ccjs_value* out) {
  if (allocator == 0 || name == 0 || name_len == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  ccjs_value raw = ccjs_undefined_value();
  ccjs_status status = ccjs_fetch_headers_raw(headers, &raw);

  if (status != CCJS_OK) {
    return status;
  }

  if (raw.tag != CCJS_TAG_STRING || raw.as.ref == 0) {
    ccjs_release(raw);
    return CCJS_ERR_TYPE;
  }

  ccjs_string* raw_string = (ccjs_string*)raw.as.ref;
  const char* value = 0;
  size_t value_len = 0;

  if (ccjs_fetch_find_header_value(raw_string->bytes, raw_string->len, name, name_len, &value, &value_len)) {
    status = ccjs_string_from_literal(allocator, value, value_len, out);
  } else {
    *out = ccjs_null_value();
    status = CCJS_OK;
  }

  ccjs_release(raw);
  return status;
}

ccjs_status ccjs_fetch_headers_has(ccjs_value headers, const char* name, size_t name_len, int* out) {
  if (name == 0 || name_len == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  ccjs_value raw = ccjs_undefined_value();
  ccjs_status status = ccjs_fetch_headers_raw(headers, &raw);

  if (status != CCJS_OK) {
    return status;
  }

  if (raw.tag != CCJS_TAG_STRING || raw.as.ref == 0) {
    ccjs_release(raw);
    return CCJS_ERR_TYPE;
  }

  ccjs_string* raw_string = (ccjs_string*)raw.as.ref;
  const char* value = 0;
  size_t value_len = 0;
  *out = ccjs_fetch_find_header_value(raw_string->bytes, raw_string->len, name, name_len, &value, &value_len) ? 1 : 0;

  ccjs_release(raw);
  return CCJS_OK;
}

ccjs_status ccjs_fetch_abort_controller_new(ccjs_allocator* allocator, ccjs_value* out) {
  static const ccjs_field_info signal_fields[] = { { "aborted", 0 } };
  static const ccjs_shape signal_shape = { 1, signal_fields };
  static const ccjs_field_info controller_fields[] = { { "signal", CCJS_FIELD_READONLY } };
  static const ccjs_shape controller_shape = { 1, controller_fields };

  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  ccjs_value signal = ccjs_undefined_value();
  ccjs_value controller = ccjs_undefined_value();
  ccjs_status status = ccjs_object_new(allocator, &signal_shape, &signal);

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(signal, CCJS_FETCH_ABORT_SIGNAL_ABORTED_INDEX, ccjs_bool_value(false));
  }

  if (status == CCJS_OK) {
    status = ccjs_object_new(allocator, &controller_shape, &controller);
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(controller, CCJS_FETCH_ABORT_CONTROLLER_SIGNAL_INDEX, signal);
  }

  ccjs_release(signal);

  if (status != CCJS_OK) {
    ccjs_release(controller);
    return status;
  }

  *out = controller;

  return CCJS_OK;
}

ccjs_status ccjs_fetch_abort_controller_signal(ccjs_value controller, ccjs_value* out) {
  return ccjs_object_get_known(controller, CCJS_FETCH_ABORT_CONTROLLER_SIGNAL_INDEX, out);
}

ccjs_status ccjs_fetch_abort_controller_abort(ccjs_value controller) {
  ccjs_value signal = ccjs_undefined_value();
  ccjs_status status = ccjs_fetch_abort_controller_signal(controller, &signal);

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(signal, CCJS_FETCH_ABORT_SIGNAL_ABORTED_INDEX, ccjs_bool_value(true));
  }

  ccjs_release(signal);

  return status;
}

ccjs_status ccjs_fetch_signal_aborted(ccjs_value signal, int* out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  ccjs_value aborted = ccjs_undefined_value();
  ccjs_status status = ccjs_object_get_known(signal, CCJS_FETCH_ABORT_SIGNAL_ABORTED_INDEX, &aborted);

  if (status != CCJS_OK) {
    return status;
  }

  if (aborted.tag != CCJS_TAG_BOOL) {
    ccjs_release(aborted);
    return CCJS_ERR_TYPE;
  }

  *out = aborted.as.boolean ? 1 : 0;
  ccjs_release(aborted);

  return CCJS_OK;
}

static ccjs_status ccjs_fetch_parse_url(const char* url, char* host, size_t host_len, int* port, char* path, size_t path_len) {
  const char* prefix = "http://";
  size_t prefix_len = strlen(prefix);

  if (strncmp(url, prefix, prefix_len) != 0 || host == 0 || port == 0 || path == 0) {
    return CCJS_ERR_UNSUPPORTED;
  }

  const char* cursor = url + prefix_len;
  const char* host_start = cursor;

  while (*cursor != '\0' && *cursor != ':' && *cursor != '/' && *cursor != '?' && *cursor != '#') {
    cursor += 1;
  }

  size_t parsed_host_len = (size_t)(cursor - host_start);

  if (parsed_host_len == 0 || parsed_host_len >= host_len) {
    return CCJS_ERR_UNSUPPORTED;
  }

  if (parsed_host_len == 9 && strncasecmp(host_start, "localhost", 9) == 0) {
    if (host_len <= strlen("127.0.0.1")) {
      return CCJS_ERR_UNSUPPORTED;
    }

    memcpy(host, "127.0.0.1", strlen("127.0.0.1") + 1);
  } else {
    memcpy(host, host_start, parsed_host_len);
    host[parsed_host_len] = '\0';
  }

  *port = 80;

  if (*cursor == ':') {
    cursor += 1;
    int parsed_port = 0;

    if (!isdigit((unsigned char)*cursor)) {
      return CCJS_ERR_UNSUPPORTED;
    }

    while (isdigit((unsigned char)*cursor)) {
      parsed_port = parsed_port * 10 + (*cursor - '0');
      cursor += 1;
    }

    if (parsed_port <= 0 || parsed_port > 65535) {
      return CCJS_ERR_UNSUPPORTED;
    }

    *port = parsed_port;
  }

  const char* parsed_path = "/";
  char query_path[512];

  if (*cursor == '/') {
    parsed_path = cursor;
  } else if (*cursor == '?') {
    size_t query_len = strlen(cursor);

    if (query_len + 2 > sizeof(query_path)) {
      return CCJS_ERR_UNSUPPORTED;
    }

    query_path[0] = '/';
    memcpy(query_path + 1, cursor, query_len + 1);
    parsed_path = query_path;
  }

  size_t parsed_path_len = 0;

  while (parsed_path[parsed_path_len] != '\0' && parsed_path[parsed_path_len] != '#') {
    parsed_path_len += 1;
  }

  if (parsed_path_len == 0 || parsed_path_len >= path_len) {
    return CCJS_ERR_UNSUPPORTED;
  }

  memcpy(path, parsed_path, parsed_path_len);
  path[parsed_path_len] = '\0';
  return CCJS_OK;
}

static ccjs_status ccjs_fetch_copy_url(ccjs_allocator* allocator, const char* url, size_t url_len, char** out) {
  if (allocator == 0 || url == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = allocator->alloc(allocator->user, url_len + 1, _Alignof(char));

  if (*out == 0) {
    return CCJS_ERR_OOM;
  }

  memcpy(*out, url, url_len);
  (*out)[url_len] = '\0';

  return CCJS_OK;
}

static ccjs_status ccjs_fetch_set_url(ccjs_fetch_operation* request, const char* url) {
  if (request == 0 || url == 0) {
    return CCJS_ERR_TYPE;
  }

  size_t url_len = strlen(url);

  if (url_len == 0 || url_len >= sizeof(request->url)) {
    return CCJS_ERR_UNSUPPORTED;
  }

  memcpy(request->url, url, url_len + 1);
  request->url_len = url_len;

  return ccjs_fetch_parse_url(request->url, request->host, sizeof(request->host), &request->port, request->path, sizeof(request->path));
}

static ccjs_status ccjs_fetch_start_connection(ccjs_fetch_operation* request) {
  if (request == 0 || request->loop == 0) {
    return CCJS_ERR_TYPE;
  }

  request->socket = 0;
  return ccjs_net_connect(
    request->loop,
    request->host,
    request->port,
    ccjs_fetch_on_connect,
    ccjs_fetch_on_data,
    ccjs_fetch_on_close,
    request,
    &request->socket
  );
}

static ccjs_status ccjs_fetch_build_request(ccjs_fetch_operation* request, const ccjs_fetch_init* init) {
  if (request == 0) {
    return CCJS_ERR_TYPE;
  }

  const char* method = "GET";
  size_t method_len = 3;
  const ccjs_fetch_header* headers = 0;
  size_t header_count = 0;
  const char* body = 0;
  size_t body_len = 0;
  request->replayable = 1;
  request->request_len = 0;

  if (init != 0) {
    if (init->method != 0 && init->method_len > 0) {
      method = init->method;
      method_len = init->method_len;
    }

    headers = init->headers;
    header_count = init->header_count;
    body = init->body;
    body_len = init->body_len;
    request->replayable = method_len == 3 && strncasecmp(method, "GET", 3) == 0 && header_count == 0 && body_len == 0;

    ccjs_status redirect_status = ccjs_fetch_redirect_mode_from_init(init, &request->redirect_mode);

    if (redirect_status != CCJS_OK) {
      return redirect_status;
    }

    if (init->signal.tag != CCJS_TAG_UNDEFINED && init->signal.tag != CCJS_TAG_NULL) {
      if (init->signal.tag != CCJS_TAG_OBJECT || init->signal.as.ref == 0) {
        return CCJS_ERR_TYPE;
      }

      request->signal = init->signal;
      ccjs_retain(request->signal);
    }
  }

  if (method == 0 || method_len == 0 || method_len > 32) {
    return CCJS_ERR_UNSUPPORTED;
  }

  if (header_count > 0 && headers == 0) {
    return CCJS_ERR_TYPE;
  }

  if (body_len > 0 && body == 0) {
    return CCJS_ERR_TYPE;
  }

  size_t offset = 0;
  ccjs_status status = ccjs_fetch_append_bytes(request->request, sizeof(request->request), &offset, method, method_len);

  if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, " ");
  if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, request->path);
  if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, " HTTP/1.1\r\nHost: ");
  if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, request->host);
  if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, "\r\n");

  for (size_t index = 0; status == CCJS_OK && index < header_count; index += 1) {
    const ccjs_fetch_header* header = headers + index;

    if (header->name == 0 || header->name_len == 0 || header->value == 0) {
      return CCJS_ERR_TYPE;
    }

    status = ccjs_fetch_append_bytes(request->request, sizeof(request->request), &offset, header->name, header->name_len);
    if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, ": ");
    if (status == CCJS_OK) status = ccjs_fetch_append_bytes(request->request, sizeof(request->request), &offset, header->value, header->value_len);
    if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, "\r\n");
  }

  if (status == CCJS_OK && body_len > 0 && !ccjs_fetch_headers_include(headers, header_count, "Content-Length")) {
    status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, "Content-Length: ");
    if (status == CCJS_OK) status = ccjs_fetch_append_size(request->request, sizeof(request->request), &offset, body_len);
    if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, "\r\n");
  }

  if (status == CCJS_OK && !ccjs_fetch_headers_include(headers, header_count, "Connection")) {
    status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, "Connection: close\r\n");
  }

  if (status == CCJS_OK) status = ccjs_fetch_append_cstr(request->request, sizeof(request->request), &offset, "\r\n");
  if (status == CCJS_OK && body_len > 0) {
    status = ccjs_fetch_append_bytes(request->request, sizeof(request->request), &offset, body, body_len);
  }

  if (status != CCJS_OK) {
    return status;
  }

  request->request_len = offset;
  return CCJS_OK;
}

static ccjs_status ccjs_fetch_operation_is_aborted(ccjs_fetch_operation* request, int* out) {
  if (request == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;

  if (request->signal.tag == CCJS_TAG_UNDEFINED || request->signal.tag == CCJS_TAG_NULL) {
    return CCJS_OK;
  }

  return ccjs_fetch_signal_aborted(request->signal, out);
}

static void ccjs_fetch_operation_free(ccjs_fetch_operation* request) {
  if (request == 0 || request->allocator == 0) {
    return;
  }

  ccjs_release(request->signal);
  request->allocator->free(request->allocator->user, request, sizeof(ccjs_fetch_operation), _Alignof(ccjs_fetch_operation));
}

static ccjs_status ccjs_fetch_append_bytes(char* out, size_t out_size, size_t* offset, const char* bytes, size_t len) {
  if (out == 0 || offset == 0 || (len > 0 && bytes == 0)) {
    return CCJS_ERR_TYPE;
  }

  if (*offset > out_size || len > out_size - *offset) {
    return CCJS_ERR_UNSUPPORTED;
  }

  if (len > 0) {
    memcpy(out + *offset, bytes, len);
  }

  *offset += len;
  return CCJS_OK;
}

static ccjs_status ccjs_fetch_append_cstr(char* out, size_t out_size, size_t* offset, const char* text) {
  if (text == 0) {
    return CCJS_ERR_TYPE;
  }

  return ccjs_fetch_append_bytes(out, out_size, offset, text, strlen(text));
}

static ccjs_status ccjs_fetch_append_size(char* out, size_t out_size, size_t* offset, size_t value) {
  char buffer[32];
  int written = snprintf(buffer, sizeof(buffer), "%zu", value);

  if (written < 0 || (size_t)written >= sizeof(buffer)) {
    return CCJS_ERR_FIELD;
  }

  return ccjs_fetch_append_bytes(out, out_size, offset, buffer, (size_t)written);
}

static int ccjs_fetch_header_name_equals(const char* name, size_t name_len, const char* expected) {
  if (name == 0 || expected == 0 || strlen(expected) != name_len) {
    return 0;
  }

  for (size_t index = 0; index < name_len; index += 1) {
    if (tolower((unsigned char)name[index]) != tolower((unsigned char)expected[index])) {
      return 0;
    }
  }

  return 1;
}

static int ccjs_fetch_headers_include(const ccjs_fetch_header* headers, size_t header_count, const char* name) {
  if (headers == 0 || name == 0) {
    return 0;
  }

  for (size_t index = 0; index < header_count; index += 1) {
    if (ccjs_fetch_header_name_equals(headers[index].name, headers[index].name_len, name)) {
      return 1;
    }
  }

  return 0;
}

static ccjs_status ccjs_fetch_redirect_mode_from_init(const ccjs_fetch_init* init, int* out) {
  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  if (init == 0 || init->redirect == 0 || init->redirect_len == 0) {
    *out = CCJS_FETCH_REDIRECT_FOLLOW;
    return CCJS_OK;
  }

  if (init->redirect_len == 6 && strncasecmp(init->redirect, "follow", 6) == 0) {
    *out = CCJS_FETCH_REDIRECT_FOLLOW;
    return CCJS_OK;
  }

  if (init->redirect_len == 5 && strncasecmp(init->redirect, "error", 5) == 0) {
    *out = CCJS_FETCH_REDIRECT_ERROR;
    return CCJS_OK;
  }

  if (init->redirect_len == 6 && strncasecmp(init->redirect, "manual", 6) == 0) {
    *out = CCJS_FETCH_REDIRECT_MANUAL;
    return CCJS_OK;
  }

  return CCJS_ERR_UNSUPPORTED;
}

static ccjs_status ccjs_fetch_on_connect(void* user, ccjs_net_socket* socket, ccjs_status status) {
  ccjs_fetch_operation* request = (ccjs_fetch_operation*)user;

  if (status != CCJS_OK) {
    return ccjs_fetch_finish(request, status, 0);
  }

  int aborted = 0;
  status = ccjs_fetch_operation_is_aborted(request, &aborted);

  if (status != CCJS_OK) {
    return ccjs_fetch_finish(request, status, 0);
  }

  if (aborted) {
    return ccjs_fetch_finish(request, CCJS_ERR_THROW, 0);
  }

  if (ccjs_net_socket_read_start(socket) != CCJS_OK) {
    return ccjs_fetch_finish(request, CCJS_ERR_FIELD, 0);
  }

  return ccjs_net_socket_write(socket, request->request, request->request_len);
}

static ccjs_status ccjs_fetch_on_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len) {
  (void)socket;
  ccjs_fetch_operation* request = (ccjs_fetch_operation*)user;

  int aborted = 0;
  ccjs_status status = ccjs_fetch_operation_is_aborted(request, &aborted);

  if (status != CCJS_OK) {
    return ccjs_fetch_finish(request, status, 0);
  }

  if (aborted) {
    return ccjs_fetch_finish(request, CCJS_ERR_THROW, 0);
  }

  if (request->response_len + len > sizeof(request->response)) {
    return ccjs_fetch_finish(request, CCJS_ERR_UNSUPPORTED, 0);
  }

  memcpy(request->response + request->response_len, bytes, len);
  request->response_len += len;

  return ccjs_fetch_try_complete(request);
}

static void ccjs_fetch_on_close(void* user, ccjs_net_socket* socket) {
  (void)socket;
  ccjs_fetch_operation* request = (ccjs_fetch_operation*)user;

  if (request == 0) {
    return;
  }

  if (request->completed) {
    ccjs_fetch_operation_free(request);
    return;
  }

  if (request->waiting_redirect_close) {
    request->socket = 0;
    request->waiting_redirect_close = 0;
    ccjs_status status = ccjs_fetch_start_connection(request);

    if (status != CCJS_OK) {
      ccjs_fetch_finish(request, status, 0);
      ccjs_fetch_operation_free(request);
    }

    return;
  }

  ccjs_fetch_finish(request, CCJS_ERR_FIELD, 0);
  ccjs_fetch_operation_free(request);
}

static ccjs_status ccjs_fetch_abort_poll(void* user) {
  ccjs_fetch_operation* request = (ccjs_fetch_operation*)user;

  if (request == 0 || request->completed) {
    return CCJS_OK;
  }

  int aborted = 0;
  ccjs_status status = ccjs_fetch_operation_is_aborted(request, &aborted);

  if (status != CCJS_OK) {
    return ccjs_fetch_finish(request, status, 0);
  }

  if (aborted) {
    return ccjs_fetch_finish(request, CCJS_ERR_THROW, 0);
  }

  return CCJS_OK;
}

static ccjs_status ccjs_fetch_try_complete(ccjs_fetch_operation* request) {
  const char* header_end = ccjs_fetch_find_header_end(request->response, request->response_len);

  if (header_end == 0) {
    return CCJS_OK;
  }

  size_t header_len = (size_t)(header_end - request->response);
  size_t content_len = 0;

  if (!ccjs_fetch_parse_content_length(request->response, header_len, &content_len)) {
    return CCJS_OK;
  }

  if (request->response_len < header_len + content_len) {
    return CCJS_OK;
  }

  int status = 0;
  const char* status_text = "";
  size_t status_text_len = 0;

  if (!ccjs_fetch_parse_status_line(request->response, header_len, &status, &status_text, &status_text_len)) {
    return ccjs_fetch_finish(request, CCJS_ERR_FIELD, 0);
  }

  if (ccjs_fetch_is_redirect_status(status)) {
    const char* location = 0;
    size_t location_len = 0;

    if (request->redirect_mode == CCJS_FETCH_REDIRECT_ERROR) {
      return ccjs_fetch_finish(request, CCJS_ERR_UNSUPPORTED, 0);
    }

    if (
      request->redirect_mode == CCJS_FETCH_REDIRECT_FOLLOW &&
      ccjs_fetch_find_header_value(request->response, header_len, "Location", 8, &location, &location_len)
    ) {
      return ccjs_fetch_follow_redirect(request, location, location_len);
    }
  }

  ccjs_fetch_response response = {
    status,
    status >= 200 && status < 300,
    request->redirected ? true : false,
    request->url,
    request->url_len,
    status_text,
    status_text_len,
    request->response,
    header_len,
    request->response + header_len,
    content_len
  };

  return ccjs_fetch_finish(request, CCJS_OK, &response);
}

static const char* ccjs_fetch_find_header_end(const char* bytes, size_t len) {
  if (bytes == 0 || len < 4) {
    return 0;
  }

  for (size_t index = 0; index + 3 < len; index += 1) {
    if (bytes[index] == '\r' && bytes[index + 1] == '\n' && bytes[index + 2] == '\r' && bytes[index + 3] == '\n') {
      return bytes + index + 4;
    }
  }

  return 0;
}

static int ccjs_fetch_parse_status_line(
  const char* bytes,
  size_t len,
  int* status_out,
  const char** status_text,
  size_t* status_text_len
) {
  if (bytes == 0 || status_out == 0 || status_text == 0 || status_text_len == 0) {
    return 0;
  }

  const char* first_space = memchr(bytes, ' ', len);

  if (first_space == 0 || first_space + 3 >= bytes + len) {
    return 0;
  }

  int status = 0;

  for (int index = 1; index <= 3; index += 1) {
    char ch = first_space[index];

    if (!isdigit((unsigned char)ch)) {
      return 0;
    }

    status = status * 10 + (ch - '0');
  }

  const char* line_end = bytes;

  while (line_end < bytes + len && *line_end != '\r' && *line_end != '\n') {
    line_end += 1;
  }

  const char* reason = first_space + 4;

  while (reason < line_end && (*reason == ' ' || *reason == '\t')) {
    reason += 1;
  }

  *status_out = status;
  *status_text = reason;
  *status_text_len = (size_t)(line_end - reason);

  return 1;
}

static int ccjs_fetch_parse_content_length(const char* bytes, size_t header_len, size_t* out) {
  const char* key = "Content-Length:";
  size_t key_len = strlen(key);

  for (size_t index = 0; index + key_len < header_len; index += 1) {
    if (strncasecmp(bytes + index, key, key_len) == 0) {
      const char* cursor = bytes + index + key_len;
      size_t value = 0;

      while (*cursor == ' ' || *cursor == '\t') {
        cursor += 1;
      }

      if (!isdigit((unsigned char)*cursor)) {
        return 0;
      }

      while (isdigit((unsigned char)*cursor)) {
        value = value * 10 + (size_t)(*cursor - '0');
        cursor += 1;
      }

      *out = value;
      return 1;
    }
  }

  return 0;
}

static int ccjs_fetch_find_header_value(
  const char* bytes,
  size_t header_len,
  const char* name,
  size_t name_len,
  const char** value,
  size_t* value_len
) {
  if (bytes == 0 || name == 0 || name_len == 0 || value == 0 || value_len == 0) {
    return 0;
  }

  const char* cursor = bytes;
  const char* end = bytes + header_len;

  while (cursor < end && !(cursor[0] == '\r' && cursor + 1 < end && cursor[1] == '\n')) {
    cursor += 1;
  }

  if (cursor + 2 <= end) {
    cursor += 2;
  }

  while (cursor < end && !(cursor[0] == '\r' && cursor + 1 < end && cursor[1] == '\n')) {
    const char* line_end = cursor;

    while (line_end < end && *line_end != '\r' && *line_end != '\n') {
      line_end += 1;
    }

    const char* colon = memchr(cursor, ':', (size_t)(line_end - cursor));

    if (colon != 0 && (size_t)(colon - cursor) == name_len && strncasecmp(cursor, name, name_len) == 0) {
      const char* field_value = colon + 1;

      while (field_value < line_end && (*field_value == ' ' || *field_value == '\t')) {
        field_value += 1;
      }

      while (line_end > field_value && (line_end[-1] == ' ' || line_end[-1] == '\t')) {
        line_end -= 1;
      }

      *value = field_value;
      *value_len = (size_t)(line_end - field_value);
      return 1;
    }

    cursor = line_end;

    while (cursor < end && (*cursor == '\r' || *cursor == '\n')) {
      cursor += 1;
    }
  }

  return 0;
}

static int ccjs_fetch_is_redirect_status(int status) {
  return status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
}

static ccjs_status ccjs_fetch_resolve_redirect_url(
  ccjs_fetch_operation* request,
  const char* location,
  size_t location_len,
  char* out,
  size_t out_len
) {
  if (request == 0 || location == 0 || out == 0 || out_len == 0) {
    return CCJS_ERR_TYPE;
  }

  if (location_len >= out_len) {
    return CCJS_ERR_UNSUPPORTED;
  }

  if (location_len >= strlen("http://") && strncasecmp(location, "http://", strlen("http://")) == 0) {
    memcpy(out, location, location_len);
    out[location_len] = '\0';
    return CCJS_OK;
  }

  if (location_len == 0 || location[0] != '/') {
    return CCJS_ERR_UNSUPPORTED;
  }

  char origin[512];
  int written = request->port == 80
                  ? snprintf(origin, sizeof(origin), "http://%s", request->host)
                  : snprintf(origin, sizeof(origin), "http://%s:%d", request->host, request->port);

  if (written < 0 || (size_t)written >= sizeof(origin)) {
    return CCJS_ERR_UNSUPPORTED;
  }

  size_t origin_len = (size_t)written;

  if (origin_len + location_len >= out_len) {
    return CCJS_ERR_UNSUPPORTED;
  }

  memcpy(out, origin, origin_len);
  memcpy(out + origin_len, location, location_len);
  out[origin_len + location_len] = '\0';

  return CCJS_OK;
}

static ccjs_status ccjs_fetch_follow_redirect(ccjs_fetch_operation* request, const char* location, size_t location_len) {
  if (request == 0) {
    return CCJS_ERR_TYPE;
  }

  if (!request->replayable || request->redirect_count >= CCJS_FETCH_MAX_REDIRECTS) {
    return ccjs_fetch_finish(request, CCJS_ERR_UNSUPPORTED, 0);
  }

  char next_url[1024];
  ccjs_status status = ccjs_fetch_resolve_redirect_url(request, location, location_len, next_url, sizeof(next_url));

  if (status != CCJS_OK) {
    return ccjs_fetch_finish(request, status, 0);
  }

  status = ccjs_fetch_set_url(request, next_url);

  if (status == CCJS_OK) {
    status = ccjs_fetch_build_request(request, 0);
  }

  if (status != CCJS_OK) {
    return ccjs_fetch_finish(request, status, 0);
  }

  request->response_len = 0;
  request->redirect_count += 1;
  request->redirected = 1;
  request->waiting_redirect_close = 1;

  if (request->socket != 0) {
    ccjs_net_socket_close(request->socket);
  } else {
    request->waiting_redirect_close = 0;
    status = ccjs_fetch_start_connection(request);

    if (status != CCJS_OK) {
      ccjs_fetch_finish(request, status, 0);
      ccjs_fetch_operation_free(request);
      return status;
    }
  }

  return CCJS_OK;
}

static ccjs_status ccjs_fetch_finish(ccjs_fetch_operation* request, ccjs_status status, const ccjs_fetch_response* response) {
  if (request->completed) {
    return CCJS_OK;
  }

  request->completed = 1;

  if (request->abort_timer != 0) {
    ccjs_loop_clear_timer(request->abort_timer);
    request->abort_timer = 0;
  }

  ccjs_status callback_status = request->done(request->user, status, response);

  if (request->socket != 0) {
    ccjs_net_socket_close(request->socket);
  }

  return callback_status;
}

static ccjs_status ccjs_fetch_promise_done(void* user, ccjs_status status, const ccjs_fetch_response* response) {
  ccjs_fetch_promise_request* request = (ccjs_fetch_promise_request*)user;

  if (request == 0 || request->promise == 0 || request->loop == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_status result = CCJS_OK;

  if (status != CCJS_OK || response == 0) {
    result = ccjs_fetch_reject_status(request->loop, request->promise, status == CCJS_OK ? CCJS_ERR_FIELD : status);
  } else {
    ccjs_value value = ccjs_undefined_value();
    result = ccjs_fetch_response_new(request->loop->allocator, request->url, request->url_len, response, &value);

    if (result == CCJS_OK) {
      ccjs_status resolve_status = ccjs_promise_resolve(request->promise, value);
      ccjs_release(value);
      result = resolve_status;
    } else {
      result = ccjs_fetch_reject_status(request->loop, request->promise, result);
    }
  }

  ccjs_fetch_promise_request_free(request);

  return result;
}

static ccjs_status ccjs_fetch_response_new(
  ccjs_allocator* allocator,
  const char* url,
  size_t url_len,
  const ccjs_fetch_response* response,
  ccjs_value* out
) {
  static const ccjs_field_info fields[] = { { "status", CCJS_FIELD_READONLY },
                                            { "ok", CCJS_FIELD_READONLY },
                                            { "url", CCJS_FIELD_READONLY },
                                            { "statusText", CCJS_FIELD_READONLY },
                                            { "redirected", CCJS_FIELD_READONLY },
                                            { "headers", CCJS_FIELD_READONLY },
                                            { "__ccjsBody", CCJS_FIELD_READONLY } };
  static const ccjs_shape shape = { 7, fields };

  if (allocator == 0 || response == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  ccjs_value object = ccjs_undefined_value();
  ccjs_value url_value = ccjs_undefined_value();
  ccjs_value status_text_value = ccjs_undefined_value();
  ccjs_value headers_value = ccjs_undefined_value();
  ccjs_value body_value = ccjs_undefined_value();
  ccjs_status status = ccjs_object_new(allocator, &shape, &object);

  if (status == CCJS_OK) {
    status = ccjs_string_from_literal(
      allocator,
      response->url == 0 ? (url == 0 ? "" : url) : response->url,
      response->url == 0 ? url_len : response->url_len,
      &url_value
    );
  }

  if (status == CCJS_OK) {
    status = ccjs_string_from_literal(
      allocator,
      response->status_text == 0 ? "" : response->status_text,
      response->status_text == 0 ? 0 : response->status_text_len,
      &status_text_value
    );
  }

  if (status == CCJS_OK) {
    status = ccjs_fetch_headers_new(
      allocator,
      response->headers == 0 ? "" : response->headers,
      response->headers == 0 ? 0 : response->headers_len,
      &headers_value
    );
  }

  if (status == CCJS_OK) {
    status = ccjs_string_from_literal(
      allocator,
      response->body == 0 ? "" : response->body,
      response->body == 0 ? 0 : response->body_len,
      &body_value
    );
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, CCJS_FETCH_RESPONSE_STATUS_INDEX, ccjs_number_value((ccjs_number)response->status));
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, CCJS_FETCH_RESPONSE_OK_INDEX, ccjs_bool_value(response->ok));
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, CCJS_FETCH_RESPONSE_URL_INDEX, url_value);
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, CCJS_FETCH_RESPONSE_STATUS_TEXT_INDEX, status_text_value);
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, CCJS_FETCH_RESPONSE_REDIRECTED_INDEX, ccjs_bool_value(response->redirected));
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, CCJS_FETCH_RESPONSE_HEADERS_INDEX, headers_value);
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, CCJS_FETCH_RESPONSE_BODY_INDEX, body_value);
  }

  ccjs_release(url_value);
  ccjs_release(status_text_value);
  ccjs_release(headers_value);
  ccjs_release(body_value);

  if (status != CCJS_OK) {
    ccjs_release(object);
    return status;
  }

  *out = object;

  return CCJS_OK;
}

static ccjs_status ccjs_fetch_headers_new(ccjs_allocator* allocator, const char* headers, size_t headers_len, ccjs_value* out) {
  static const ccjs_field_info fields[] = { { "__ccjsHeaders", CCJS_FIELD_READONLY } };
  static const ccjs_shape shape = { 1, fields };

  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  ccjs_value object = ccjs_undefined_value();
  ccjs_value raw = ccjs_undefined_value();
  ccjs_status status = ccjs_object_new(allocator, &shape, &object);

  if (status == CCJS_OK) {
    status = ccjs_string_from_literal(allocator, headers == 0 ? "" : headers, headers == 0 ? 0 : headers_len, &raw);
  }

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(object, CCJS_FETCH_HEADERS_RAW_INDEX, raw);
  }

  ccjs_release(raw);

  if (status != CCJS_OK) {
    ccjs_release(object);
    return status;
  }

  *out = object;

  return CCJS_OK;
}

static ccjs_status ccjs_fetch_headers_raw(ccjs_value headers, ccjs_value* out) {
  return ccjs_object_get_known(headers, CCJS_FETCH_HEADERS_RAW_INDEX, out);
}

static ccjs_status ccjs_fetch_reject_status(ccjs_loop* loop, ccjs_promise* promise, ccjs_status status) {
  if (loop == 0 || promise == 0 || loop->allocator == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_value error = ccjs_undefined_value();
  ccjs_status error_status = ccjs_fetch_error_from_status(loop->allocator, status, &error);

  if (error_status != CCJS_OK) {
    return ccjs_promise_reject(promise, ccjs_number_value((ccjs_number)status));
  }

  ccjs_status reject_status = ccjs_promise_reject(promise, error);
  ccjs_release(error);

  return reject_status == CCJS_OK ? CCJS_OK : reject_status;
}

static ccjs_status ccjs_fetch_error_from_status(ccjs_allocator* allocator, ccjs_status status, ccjs_value* out) {
  static const ccjs_field_info fields[] = { { "name", CCJS_FIELD_READONLY },
                                            { "message", CCJS_FIELD_READONLY },
                                            { "code", CCJS_FIELD_READONLY } };
  static const ccjs_shape shape = { 3, fields };

  if (allocator == 0 || out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  ccjs_value error = ccjs_undefined_value();
  const char* name_text = status == CCJS_ERR_THROW ? "AbortError" : "FetchError";
  const char* code_text = status == CCJS_ERR_THROW ? "ABORT_ERR" : "ERR_FETCH";
  const char* message_text = ccjs_fetch_error_message(status);
  ccjs_status result = ccjs_object_new(allocator, &shape, &error);

  if (result == CCJS_OK) {
    result = ccjs_fetch_error_field(allocator, error, 0, name_text, strlen(name_text));
  }

  if (result == CCJS_OK) {
    result = ccjs_fetch_error_field(allocator, error, 1, message_text, strlen(message_text));
  }

  if (result == CCJS_OK) {
    result = ccjs_fetch_error_field(allocator, error, 2, code_text, strlen(code_text));
  }

  if (result != CCJS_OK) {
    ccjs_release(error);
    return result;
  }

  *out = error;

  return CCJS_OK;
}

static ccjs_status ccjs_fetch_error_field(
  ccjs_allocator* allocator,
  ccjs_value error,
  uint32_t index,
  const char* value,
  size_t value_len
) {
  ccjs_value field = ccjs_undefined_value();
  ccjs_status status = ccjs_string_from_literal(allocator, value, value_len, &field);

  if (status == CCJS_OK) {
    status = ccjs_object_init_known(error, index, field);
  }

  ccjs_release(field);

  return status;
}

static const char* ccjs_fetch_error_message(ccjs_status status) {
  if (status == CCJS_ERR_THROW) {
    return "fetch request aborted";
  }

  if (status == CCJS_ERR_UNSUPPORTED) {
    return "unsupported fetch URL or response";
  }

  if (status == CCJS_ERR_OOM) {
    return "fetch allocation failed";
  }

  return "fetch request failed";
}

static void ccjs_fetch_promise_request_free(ccjs_fetch_promise_request* request) {
  if (request == 0 || request->loop == 0 || request->loop->allocator == 0) {
    return;
  }

  ccjs_allocator* allocator = request->loop->allocator;

  if (request->url != 0) {
    allocator->free(allocator->user, request->url, request->url_len + 1, _Alignof(char));
  }

  ccjs_promise_release(request->promise);
  allocator->free(allocator->user, request, sizeof(ccjs_fetch_promise_request), _Alignof(ccjs_fetch_promise_request));
}

#else

ccjs_status ccjs_fetch_get(ccjs_loop* loop, const char* url, ccjs_fetch_done_fn done, void* user) {
  (void)loop;
  (void)url;
  (void)done;
  (void)user;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_fetch_request(ccjs_loop* loop, const char* url, const ccjs_fetch_init* init, ccjs_fetch_done_fn done, void* user) {
  (void)loop;
  (void)url;
  (void)init;
  (void)done;
  (void)user;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_fetch(ccjs_loop* loop, const char* url, size_t url_len, ccjs_promise** out) {
  return ccjs_fetch_with_init(loop, url, url_len, 0, out);
}

ccjs_status ccjs_fetch_with_init(
  ccjs_loop* loop,
  const char* url,
  size_t url_len,
  const ccjs_fetch_init* init,
  ccjs_promise** out
) {
  (void)loop;
  (void)url;
  (void)url_len;
  (void)init;

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_fetch_response_text(ccjs_loop* loop, ccjs_value response, ccjs_promise** out) {
  (void)loop;
  (void)response;

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_fetch_headers_get(ccjs_allocator* allocator, ccjs_value headers, const char* name, size_t name_len, ccjs_value* out) {
  (void)allocator;
  (void)headers;
  (void)name;
  (void)name_len;

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_fetch_headers_has(ccjs_value headers, const char* name, size_t name_len, int* out) {
  (void)headers;
  (void)name;
  (void)name_len;

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_fetch_abort_controller_new(ccjs_allocator* allocator, ccjs_value* out) {
  (void)allocator;

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_fetch_abort_controller_signal(ccjs_value controller, ccjs_value* out) {
  (void)controller;

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = ccjs_undefined_value();
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_fetch_abort_controller_abort(ccjs_value controller) {
  (void)controller;
  return CCJS_ERR_UNSUPPORTED;
}

ccjs_status ccjs_fetch_signal_aborted(ccjs_value signal, int* out) {
  (void)signal;

  if (out == 0) {
    return CCJS_ERR_TYPE;
  }

  *out = 0;
  return CCJS_ERR_UNSUPPORTED;
}

#endif
