#include "ccjs/fetch.h"

#ifdef CCJS_LOOP_BACKEND_LIBUV
#include "ccjs/net.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct ccjs_fetch_request {
  ccjs_loop* loop;
  ccjs_allocator* allocator;
  ccjs_net_socket* socket;
  ccjs_fetch_done_fn done;
  void* user;
  char host[256];
  char path[512];
  int port;
  char response[8192];
  size_t response_len;
  int completed;
} ccjs_fetch_request;

static ccjs_status ccjs_fetch_parse_url(const char* url, char* host, size_t host_len, int* port, char* path, size_t path_len);
static ccjs_status ccjs_fetch_on_connect(void* user, ccjs_net_socket* socket, ccjs_status status);
static ccjs_status ccjs_fetch_on_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len);
static void ccjs_fetch_on_close(void* user, ccjs_net_socket* socket);
static ccjs_status ccjs_fetch_try_complete(ccjs_fetch_request* request);
static const char* ccjs_fetch_find_header_end(const char* bytes, size_t len);
static int ccjs_fetch_parse_status(const char* bytes, size_t len);
static int ccjs_fetch_parse_content_length(const char* bytes, size_t header_len, size_t* out);
static ccjs_status ccjs_fetch_finish(ccjs_fetch_request* request, ccjs_status status, const ccjs_fetch_response* response);

ccjs_status ccjs_fetch_get(ccjs_loop* loop, const char* url, ccjs_fetch_done_fn done, void* user) {
  if (loop == 0 || loop->allocator == 0 || url == 0 || done == 0) {
    return CCJS_ERR_TYPE;
  }

  ccjs_allocator* allocator = loop->allocator;
  ccjs_fetch_request* request =
    allocator->alloc(allocator->user, sizeof(ccjs_fetch_request), _Alignof(ccjs_fetch_request));

  if (request == 0) {
    return CCJS_ERR_OOM;
  }

  memset(request, 0, sizeof(ccjs_fetch_request));
  request->loop = loop;
  request->allocator = allocator;
  request->done = done;
  request->user = user;

  ccjs_status status = ccjs_fetch_parse_url(url, request->host, sizeof(request->host), &request->port, request->path, sizeof(request->path));

  if (status != CCJS_OK) {
    allocator->free(allocator->user, request, sizeof(ccjs_fetch_request), _Alignof(ccjs_fetch_request));
    return status;
  }

  status = ccjs_net_connect(
    loop,
    request->host,
    request->port,
    ccjs_fetch_on_connect,
    ccjs_fetch_on_data,
    ccjs_fetch_on_close,
    request,
    &request->socket
  );

  if (status != CCJS_OK) {
    allocator->free(allocator->user, request, sizeof(ccjs_fetch_request), _Alignof(ccjs_fetch_request));
    return status;
  }

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

  while (*cursor != '\0' && *cursor != ':' && *cursor != '/') {
    cursor += 1;
  }

  size_t parsed_host_len = (size_t)(cursor - host_start);

  if (parsed_host_len == 0 || parsed_host_len >= host_len) {
    return CCJS_ERR_UNSUPPORTED;
  }

  memcpy(host, host_start, parsed_host_len);
  host[parsed_host_len] = '\0';
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

  const char* parsed_path = *cursor == '/' ? cursor : "/";
  size_t parsed_path_len = strlen(parsed_path);

  if (parsed_path_len == 0 || parsed_path_len >= path_len) {
    return CCJS_ERR_UNSUPPORTED;
  }

  memcpy(path, parsed_path, parsed_path_len + 1);
  return CCJS_OK;
}

static ccjs_status ccjs_fetch_on_connect(void* user, ccjs_net_socket* socket, ccjs_status status) {
  ccjs_fetch_request* request = (ccjs_fetch_request*)user;

  if (status != CCJS_OK) {
    return ccjs_fetch_finish(request, status, 0);
  }

  char header[1024];
  int header_len = snprintf(
    header,
    sizeof(header),
    "GET %s HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n",
    request->path,
    request->host
  );

  if (header_len < 0 || (size_t)header_len >= sizeof(header)) {
    return ccjs_fetch_finish(request, CCJS_ERR_FIELD, 0);
  }

  if (ccjs_net_socket_read_start(socket) != CCJS_OK) {
    return ccjs_fetch_finish(request, CCJS_ERR_FIELD, 0);
  }

  return ccjs_net_socket_write(socket, header, (size_t)header_len);
}

static ccjs_status ccjs_fetch_on_data(void* user, ccjs_net_socket* socket, const char* bytes, size_t len) {
  (void)socket;
  ccjs_fetch_request* request = (ccjs_fetch_request*)user;

  if (request->response_len + len > sizeof(request->response)) {
    return ccjs_fetch_finish(request, CCJS_ERR_UNSUPPORTED, 0);
  }

  memcpy(request->response + request->response_len, bytes, len);
  request->response_len += len;

  return ccjs_fetch_try_complete(request);
}

static void ccjs_fetch_on_close(void* user, ccjs_net_socket* socket) {
  (void)socket;
  ccjs_fetch_request* request = (ccjs_fetch_request*)user;

  if (request == 0) {
    return;
  }

  if (!request->completed) {
    ccjs_fetch_finish(request, CCJS_ERR_FIELD, 0);
  }

  request->allocator->free(request->allocator->user, request, sizeof(ccjs_fetch_request), _Alignof(ccjs_fetch_request));
}

static ccjs_status ccjs_fetch_try_complete(ccjs_fetch_request* request) {
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

  int status = ccjs_fetch_parse_status(request->response, header_len);

  if (status <= 0) {
    return ccjs_fetch_finish(request, CCJS_ERR_FIELD, 0);
  }

  ccjs_fetch_response response = {
    status,
    status >= 200 && status < 300,
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

static int ccjs_fetch_parse_status(const char* bytes, size_t len) {
  const char* first_space = memchr(bytes, ' ', len);

  if (first_space == 0 || first_space + 3 >= bytes + len) {
    return -1;
  }

  int status = 0;

  for (int index = 1; index <= 3; index += 1) {
    char ch = first_space[index];

    if (!isdigit((unsigned char)ch)) {
      return -1;
    }

    status = status * 10 + (ch - '0');
  }

  return status;
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

static ccjs_status ccjs_fetch_finish(ccjs_fetch_request* request, ccjs_status status, const ccjs_fetch_response* response) {
  if (request->completed) {
    return CCJS_OK;
  }

  request->completed = 1;
  ccjs_status callback_status = request->done(request->user, status, response);

  if (request->socket != 0) {
    ccjs_net_socket_close(request->socket);
  }

  return callback_status;
}

#else

ccjs_status ccjs_fetch_get(ccjs_loop* loop, const char* url, ccjs_fetch_done_fn done, void* user) {
  (void)loop;
  (void)url;
  (void)done;
  (void)user;
  return CCJS_ERR_UNSUPPORTED;
}

#endif
