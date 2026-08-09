#include "inox/zlib.h"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <new>
#include <span>
#include <utility>
#include <vector>

#include <zlib.h>

#include "inox/binary.h"
#include "inox/loop.h"
#include "inox/string.h"

namespace {

constexpr std::size_t chunkSize = 64 * 1024;

enum class ZlibFormat {
  deflate,
  deflateRaw,
  gzip,
};

void throwZlibError(const char* operation, const char* details = nullptr) {
  inox::String message = details == nullptr
    ? inox::String::fromFormat("Error: zlib.%s failed", operation)
    : inox::String::fromFormat("Error: zlib.%s failed: %s", operation, details);

  if (!inox::thrown()) {
    inox::throw_value(std::move(message));
  }
}

std::span<const std::uint8_t> inputBytes(const inox::Value& input, Uint8Array& byteStorage) {
  if (input.tag == INOX_TAG_STRING && input.as.ref != nullptr) {
    const inox::String string(input);
    return std::span<const std::uint8_t>(
      reinterpret_cast<const std::uint8_t*>(string.bytes()),
      string.length()
    );
  }

  byteStorage = Uint8Array(input);

  if (!byteStorage.valid()) {
    if (!inox::thrown()) {
      throwZlibError("input", "data must be a string, Buffer, or Uint8Array");
    }
    return {};
  }

  return byteStorage.bytes();
}

bool appendOutput(
  std::vector<std::uint8_t>& output,
  const std::array<std::uint8_t, chunkSize>& chunk,
  std::size_t count
) {
  if (count > static_cast<std::size_t>(Buffer::maximumLength()) - output.size()) {
    throwZlibError("output", "result exceeds Buffer maximum length");
    return false;
  }

  try {
    output.insert(output.end(), chunk.begin(), chunk.begin() + count);
  } catch (const std::bad_alloc&) {
    inox::throw_out_of_memory();
    return false;
  }

  return true;
}

void feedInput(z_stream& stream, std::span<const std::uint8_t> input, std::size_t& offset) {
  if (stream.avail_in != 0 || offset >= input.size()) {
    return;
  }

  const std::size_t count = std::min(
    input.size() - offset,
    static_cast<std::size_t>(std::numeric_limits<uInt>::max())
  );
  stream.next_in = const_cast<Bytef*>(reinterpret_cast<const Bytef*>(input.data() + offset));
  stream.avail_in = static_cast<uInt>(count);
  offset += count;
}

int windowBits(ZlibFormat format) {
  if (format == ZlibFormat::gzip) {
    return MAX_WBITS + 16;
  }

  return format == ZlibFormat::deflateRaw ? -MAX_WBITS : MAX_WBITS;
}

Buffer compress(const inox::Value& input, ZlibFormat format, const char* operation) {
  Uint8Array byteStorage;
  const std::span<const std::uint8_t> bytes = inputBytes(input, byteStorage);

  if (inox::thrown()) {
    return Buffer();
  }

  z_stream stream = {};
  const int initialization = deflateInit2(
    &stream,
    Z_DEFAULT_COMPRESSION,
    Z_DEFLATED,
    windowBits(format),
    8,
    Z_DEFAULT_STRATEGY
  );

  if (initialization != Z_OK) {
    throwZlibError(operation, stream.msg);
    return Buffer();
  }

  std::vector<std::uint8_t> output;
  std::array<std::uint8_t, chunkSize> chunk = {};
  std::size_t offset = 0;
  int status = Z_OK;

  while (status != Z_STREAM_END) {
    feedInput(stream, bytes, offset);
    stream.next_out = chunk.data();
    stream.avail_out = static_cast<uInt>(chunk.size());
    const int flush = offset == bytes.size() ? Z_FINISH : Z_NO_FLUSH;
    status = deflate(&stream, flush);

    if (status != Z_OK && status != Z_STREAM_END) {
      const char* details = stream.msg;
      throwZlibError(operation, details);
      deflateEnd(&stream);
      return Buffer();
    }

    if (!appendOutput(output, chunk, chunk.size() - stream.avail_out)) {
      deflateEnd(&stream);
      return Buffer();
    }
  }

  deflateEnd(&stream);
  return Buffer(std::span<const std::uint8_t>(output.data(), output.size()));
}

Buffer decompress(const inox::Value& input, ZlibFormat format, const char* operation) {
  Uint8Array byteStorage;
  const std::span<const std::uint8_t> bytes = inputBytes(input, byteStorage);

  if (inox::thrown()) {
    return Buffer();
  }

  z_stream stream = {};
  const int initialization = inflateInit2(&stream, windowBits(format));

  if (initialization != Z_OK) {
    throwZlibError(operation, stream.msg);
    return Buffer();
  }

  std::vector<std::uint8_t> output;
  std::array<std::uint8_t, chunkSize> chunk = {};
  std::size_t offset = 0;

  while (true) {
    feedInput(stream, bytes, offset);
    stream.next_out = chunk.data();
    stream.avail_out = static_cast<uInt>(chunk.size());
    const int status = inflate(&stream, Z_NO_FLUSH);

    if (!appendOutput(output, chunk, chunk.size() - stream.avail_out)) {
      inflateEnd(&stream);
      return Buffer();
    }

    if (status == Z_STREAM_END) {
      if (format == ZlibFormat::gzip && (stream.avail_in != 0 || offset < bytes.size())) {
        if (inflateReset2(&stream, windowBits(format)) != Z_OK) {
          const char* details = stream.msg;
          throwZlibError(operation, details);
          inflateEnd(&stream);
          return Buffer();
        }
        continue;
      }

      break;
    }

    if (status != Z_OK || (stream.avail_in == 0 && offset == bytes.size() && stream.avail_out != 0)) {
      const char* details = stream.msg;
      throwZlibError(operation, details == nullptr ? "unexpected end of data" : details);
      inflateEnd(&stream);
      return Buffer();
    }
  }

  inflateEnd(&stream);
  return Buffer(std::span<const std::uint8_t>(output.data(), output.size()));
}

} // namespace

Buffer ZlibModule::deflateSync(const inox::Value& data) const {
  return compress(data, ZlibFormat::deflate, "deflateSync");
}

Buffer ZlibModule::inflateSync(const inox::Value& data) const {
  return decompress(data, ZlibFormat::deflate, "inflateSync");
}

Buffer ZlibModule::deflateRawSync(const inox::Value& data) const {
  return compress(data, ZlibFormat::deflateRaw, "deflateRawSync");
}

Buffer ZlibModule::inflateRawSync(const inox::Value& data) const {
  return decompress(data, ZlibFormat::deflateRaw, "inflateRawSync");
}

Buffer ZlibModule::gzipSync(const inox::Value& data) const {
  return compress(data, ZlibFormat::gzip, "gzipSync");
}

Buffer ZlibModule::gunzipSync(const inox::Value& data) const {
  return decompress(data, ZlibFormat::gzip, "gunzipSync");
}

const ZlibModule zlib;
