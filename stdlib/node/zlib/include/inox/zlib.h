#ifndef INOX_ZLIB_H
#define INOX_ZLIB_H

#include "inox/buffer.h"
#include "inox/value.h"

class ZlibModule {
public:
  Buffer deflateSync(const inox::Value& data) const;
  Buffer inflateSync(const inox::Value& data) const;
  Buffer deflateRawSync(const inox::Value& data) const;
  Buffer inflateRawSync(const inox::Value& data) const;
  Buffer gzipSync(const inox::Value& data) const;
  Buffer gunzipSync(const inox::Value& data) const;
};

extern const ZlibModule zlib;

#endif
