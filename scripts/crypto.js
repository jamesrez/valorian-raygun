function bytesToArrayBuffer(bytes) {
  const bytesAsArrayBuffer = new ArrayBuffer(bytes.length);
  const bytesUint8 = new Uint8Array(bytesAsArrayBuffer);
  bytesUint8.set(bytes);
  return bytesAsArrayBuffer;
}


function getKeyMaterial(password) {
  const enc = new TextEncoder();
  return window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    {name: "PBKDF2"},
    false,
    ["deriveBits", "deriveKey"]
  );
}

function getKey(keyMaterial, salt) {
  return window.crypto.subtle.deriveKey(
    {
      "name": "PBKDF2",
      salt: salt,
      "iterations": 100000,
      "hash": "SHA-256"
    },
    keyMaterial,
    { "name": "AES-KW", "length": 256},
    true,
    [ "wrapKey", "unwrapKey" ]
  );
}


async function wrapCryptoKey(keyToWrap, salt, keyMaterial, cb) {
  if(!cb) return;
  const wrappingKey = await getKey(keyMaterial, salt);
  const wrappedKey = await window.crypto.subtle.wrapKey(
    "raw",
    keyToWrap,
    wrappingKey,
    "AES-KW"
  );
  var blob = new Blob([wrappedKey], {type:'application/octet-binary'})
  var reader = new FileReader();
  reader.onload = function(event){
    if(event.target.result){
      cb(event.target.result);
    }
  };
  reader.readAsDataURL(blob);
}

async function unwrapSecretKey(wrappedKeyBase64, salt, keyMaterial, cb) {
  if(!cb) return;
  const unwrappingKey = await getKey(keyMaterial, salt);
  fetch(wrappedKeyBase64)
    .then(res => res.arrayBuffer())
    .then(async (wrappedKeyBuffer) => {
      const unwrappedKey = await window.crypto.subtle.unwrapKey(
        "raw",                 // import format
        wrappedKeyBuffer,      // ArrayBuffer representing key to unwrap
        unwrappingKey,         // CryptoKey representing key encryption key
        "AES-KW",              // algorithm identifier for key encryption key
        "AES-GCM",             // algorithm identifier for key to unwrap
        true,                  // extractability of key to unwrap
        ["encrypt", "decrypt"] // key usages for key to unwrap
      );
      cb(unwrappedKey)
    })
}

async function digestMessage(message, cb) {
  if(!cb) return;
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  var blob = new Blob([hash], {type:'application/octet-binary'})
  var reader = new FileReader();
  reader.onload = function(event){
    if(event.target.result){
      cb(event.target.result);
    }
  };
  reader.readAsDataURL(blob);
}
