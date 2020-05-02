const socket = io('https://valoria.herokuapp.com');
let peer = new Peer({
  host: 'valoria-peerjs.herokuapp.com',
  path: '/peerjs/valoria',
  debug: 2,
  secure: true
});
let username = null;
let password = null;
let userPeers = {};

const registerRayGun = async () => {
  const usernameEl = $('.raygun-username-input')
  const passwordEl = $('.raygun-password-input')
  $('.raygun-config-submit').text("Configuring RayGun")
  username = usernameEl.val();
  password = passwordEl.val();
  if(username.length > 0 && password.length > 0){
    const secretKey = await window.crypto.subtle.generateKey({
      name: "AES-GCM",
      length: 256,
    }, true, ["encrypt", "decrypt"])
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await getKeyMaterial(password);
    wrapCryptoKey(secretKey, salt, keyMaterial, (wrappedKeyBase64) => {
      const wrapped = JSON.stringify({val : wrappedKeyBase64, salt});
      digestMessage(password, (passhash) => {
        socket.emit('Create User', {
          username, password : passhash, peerId : peer.id, wrapped,
        })
      })
    });
  }
}

const useExistingRayGun = async () => {
  const usernameEl = $('.raygun-username-input')
  const passwordEl = $('.raygun-password-input')
  $('.raygun-config-submit').text("Configuring RayGun")
  username = usernameEl.val();
  password = passwordEl.val();
  if(username.length > 0 && password.length > 0){
    digestMessage(password, (passhash) => {
      socket.emit("Login User", {
        username, password : passhash, peerId : peer.id
      })
    })
  }
}

socket.on("Create User", async (d) => {
  if(!d.success) return;
  startApp(d);
})

socket.on("Login User", async (d) => {
  if(!d.success) return;
  let wrapped;
  if(d.wrapped){
    wrapped = JSON.parse(d.wrapped);
  }
  password = password ? password : $('.raygun-password-input').val();
  const keyMaterial = await getKeyMaterial(password);
  unwrapSecretKey(wrapped.val, new Uint8Array(Object.values(wrapped.salt)), keyMaterial, (unwrapped) => {
    startApp(d);
  })
})


chrome.storage.sync.get(['raygunUsername', 'raygunPassword'], (result) => {
  if(!result || !result.raygunUsername || !result.raygunPassword) return;
  username = result.raygunUsername;
  password = result.raygunPassword;
  digestMessage(password, (passhash) => {
    let waitForPeer = setInterval(() => {
      if(peer.id) {
        clearInterval(waitForPeer);
        socket.emit("Login User", {
          username, password : passhash, peerId : peer.id
        })
      }
    }, 100)
  })
})

socket.on("New User Peer", (peerId) => {
  userPeers[peerId] = peer.connect(peerId);
})

peer.on('connection', function(conn) {
  if(!userPeers[conn.peer]){
    dimPeers[conn.peer] = conn;
  }
  syncPeer(conn);
})


$(document).ready(() => {
  //CHECK IF USER IS ALREADY LOGGED IN

  //CONFIGURE RAYGUN SUBMIT
  $('.raygun-password-input').on('keyup', (e) => {
    if(e.key === 'Enter'){
      registerRayGun();
    }
  })
  $('.raygun-config-create').on('mouseup', (e) => {
    registerRayGun();
  })
  $('.raygun-config-login').on('mouseup', (e) => {
    useExistingRayGun();
  })


  //USER AVATAR
  $('.raygun-user-avatar').mouseenter(() => {
    $('.raygun-user-avatar-change').css('display', 'inline');
  }).mouseleave(() => {
    $('.raygun-user-avatar-change').css('display', 'none');
  })

  $('.raygun-user-avatar-input').on('change', async () => {
    const el = $('.raygun-user-avatar-input')[0];
    if (el.files && el.files[0]) {

      const compressedFile = await imageCompression(el.files[0], {
        maxSizeMB: 1,
        maxWidthOrHeight: 100
      });
      const data = await imageCompression.getDataUrlFromFile(compressedFile);
      socket.emit("Change Avatar", {username, avatar : data});
      $('.raygun-user-avatar-image').attr('src', data);
      chrome.storage.sync.set({raygunAvatar : data})
      for(let peerId in userPeers){
        userPeers[peerId].send({raygunAvatar : data});
      }

      // var FR= new FileReader();
      // FR.addEventListener("load", function(e) {
      //   //COMPRESS
      //   const img = new Image();
      //   img.src = e.target.result;
      //   img.onload = () => {
      //     const canvas = document.createElement('canvas');
      //     const width = 100;
      //     const scaleFactor = width / img.width;
      //     canvas.width = width;
      //     canvas.height = img.height * scaleFactor;
      //     const ctx = canvas.getContext('2d')
      //     ctx.drawImage(img, 0, 0, width, img.height * scaleFactor);
      //     const data = ctx.canvas.toDataURL(img, 'image/png', 0.1);
      //     console.log(data);
      //
      //
      //   }
      // });
      // FR.readAsDataURL( el.files[0] );
    }
  })
  $('.raygun-user-avatar-change').click(() => {
    $('.raygun-user-avatar-input').trigger('click');
  })

  // //USER NAME
  $('.raygun-name-input').on('change', (e) => {
    const name = $('.raygun-name-input').val();
    if(name.length > 0){
      chrome.storage.sync.set({raygunName : name})
      for(let peerId in userPeers){
        userPeers[peerId].send({raygunName : name});
      }
    }
  })

})


const startApp = async (d) => {
  $('.raygun-config').css('display', 'none');
  $('.raygun-app').css('display', 'flex');

  username = username ? username : $('.raygun-username-input').val()
  chrome.storage.sync.get(['raygunUsername', 'raygunPassword'], (result) => {
    if(!result || !result.raygunUsername || !result.raygunPassword){
      chrome.storage.sync.set({
        raygunUsername: username,
        raygunPassword: $('.raygun-password-input').val(),
      })
    }else if(result.raygunUsername){
      username = result.raygunUsername;
    }
  });

  console.log(d.avatar);
  $('.raygun-user-avatar-image').attr('src', d.avatar);

  for(let peerId in d.peers){
    if(peerId == peer.id) continue;
    userPeers[peerId] = peer.connect(peerId);
    syncPeer(userPeers[peerId]);
  }

  chrome.storage.sync.get(['raygunName'], (result) => {
    if(!result) return;
    let name = result.raygunName ? result.raygunName : d.name;
    $('.raygun-name-input').val(name);
    chrome.storage.sync.set({
      raygunName: name
    })
  })
}

const syncPeer = async (conn) => {
  console.log(conn.peer);
  conn.on('open', function() {

    // Receive messages
    conn.on('data', function(data) {
      if(userPeers[conn.peer]){
        console.log(data);
      }else {
        console.log("Other Peer", data);
      }
    });

  });
}
