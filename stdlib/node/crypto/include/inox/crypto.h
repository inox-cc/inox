#ifndef INOX_CRYPTO_H
#define INOX_CRYPTO_H

#include "inox/value.h"

#ifdef __cplusplus

struct CryptoHashState;
struct CryptoHmacState;

#include "inox/array.h"
#include "inox/binary.h"
#include "inox/string.h"
#include "inox/string_view.h"

class Hash {
private:
  CryptoHashState* handle_;

  explicit Hash(CryptoHashState* handle);

  friend class crypto;

public:
  Hash();
  ~Hash();
  Hash(const Hash& other) = delete;
  Hash& operator=(const Hash& other) = delete;
  Hash(Hash&& other) noexcept;
  Hash& operator=(Hash&& other) noexcept;

  bool valid() const;
  Hash& update(inox::StringView data);
  Hash& update(const inox::Value& data);
  Buffer digest();
  inox::String digestHex();
};

class Hmac {
private:
  CryptoHmacState* handle_;

  explicit Hmac(CryptoHmacState* handle);

  friend class crypto;

public:
  Hmac();
  ~Hmac();
  Hmac(const Hmac& other) = delete;
  Hmac& operator=(const Hmac& other) = delete;
  Hmac(Hmac&& other) noexcept;
  Hmac& operator=(Hmac&& other) noexcept;

  bool valid() const;
  Hmac& update(inox::StringView data);
  Hmac& update(const inox::Value& data);
  Buffer digest();
  inox::String digestHex();
};

class crypto {
public:
  ArrayClass getHashes() const;
  Uint8Array getRandomValues(Uint8Array value) const;
  Buffer randomBytes(inox_number size) const;
  Uint8Array randomFillSync(Uint8Array value, inox_number offset, inox_number size, bool has_size) const;
  inox_number randomInt(inox_number max) const;
  inox_number randomInt(inox_number min, inox_number max) const;
  inox::String randomUUID() const;
  Hash createHash(inox::StringView algorithm) const;
  Hmac createHmac(inox::StringView algorithm, inox::StringView key) const;
  Hmac createHmac(inox::StringView algorithm, const inox::Value& key) const;
  Buffer hash(inox::StringView algorithm, inox::StringView data) const;
  Buffer hash(inox::StringView algorithm, const inox::Value& data) const;
  inox::String hashHex(inox::StringView algorithm, inox::StringView data) const;
  inox::String hashHex(inox::StringView algorithm, const inox::Value& data) const;
  bool timingSafeEqual(const Uint8Array& left, const Uint8Array& right) const;
};

extern crypto crypto;

#endif

#endif
