const SIGNAL_SERVER_ADDRESS = 'https://valoria.herokuapp.com';
const socket = io(SIGNAL_SERVER_ADDRESS);
const gun = Gun('https://www.raygun.live/gun');
const peer = new Peer({
  host: 'valoria-peerjs.herokuapp.com',
  path: '/peerjs/valoria',
  debug: 2,
  secure: true
});
let mouseX = null;
let mouseY = null;
let scrollX = null
let scrollY = null;
let userIsTyping = false;
let currentDimension = "Valoria";
let username;
let password;
let userPeers = {};
let dimPeers = {};

$(document).ready(async () => {

  var body = document.body,
    html = document.documentElement;

  var biggestHeight = Math.max( body.scrollHeight, body.offsetHeight,
                       html.clientHeight, html.scrollHeight, html.offsetHeight);

  //CREATE THE RAYGUN ELEMENT
  let all = document.createElement('div');
  all.className = 'raygun-all';
  $(body).prepend(all);
  // $(all).css({
  //   height : biggestHeight,
  //   minHeight : biggestHeight
  // })
  $('input').on('focus', () => {
    userIsTyping = true;
  })
  $('input').on('blur', () => {
    userIsTyping = false;
  })
})

let waitingForAuth = setInterval(() => {
  chrome.storage.sync.get(['raygunUsername', 'raygunPassword'], (result) => {
    if(result && result.raygunUsername && result.raygunPassword){
      password = result.raygunPassword;
      digestMessage(result.raygunPassword, (passhash) => {
        socket.emit('Login User', {
          username : result.raygunUsername,
          password : passhash,
          peerId : peer.id
        })
      })
    }
  })
}, 1000)

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


socket.on("New User Peer", (peerId) => {
  userPeers[peerId] = peerId;
})

peer.on('connection', function(conn) {
  if(!userPeers[conn.peer]){
    dimPeers[conn.peer] = conn;
  }
  syncPeer(conn);
})


socket.on("User Peer Left", (peerId) => {
  delete userPeers[peerId];
})


const startApp = async (d) => {
  clearInterval(waitingForAuth);

  for(let peerId in d.peers){
    if(peerId == peer.id) continue;
    userPeers[peerId] = peer.connect(peerId);
    syncPeer(userPeers[peerId]);
  }

  //CREATE MESSAGE INPUT
  let messageEl = document.createElement('div');
  messageEl.className = 'raygun-message';
  let messageElInput = document.createElement('input');
  messageElInput.className = 'raygun-message-input';
  $(messageElInput).attr('placeholder', "Press <T> to Type a Message!");
  messageEl.append(messageElInput)
  $('.raygun-all').append(messageEl);
  $(document.body).on('keyup', (e) => {
    if(userIsTyping || e.key !== "t") return;
    messageElInput.focus();
  })

  //CREATE USER
  let userEl = document.createElement('div');
  userEl.className = 'raygun-user';
  let userMessageEl = document.createElement('div');
  userMessageEl.className = 'raygun-user-message';
  $(userEl).append(userMessageEl);
  let userAvatarEl = document.createElement('img');
  userAvatarEl.className = 'raygun-user-avatar';
  $(userEl).append(userAvatarEl);
  $(userAvatarEl).attr('src', d.avatar);
  let userNameEl = document.createElement('div');
  userNameEl.className = 'raygun-user-name';
  $(userEl).append(userNameEl);
  $('.raygun-all').append(userEl);


  chrome.storage.sync.get(['raygunName'], (result) => {
    if(!result || !result.raygunName) return;
    $(userNameEl).text(result.raygunName);
  })

  //USER POSITION
  $(document.body).on('mousemove', (e) => {
    mouseX = e.pageX;
    mouseY = e.pageY;
  })
  setInterval(() => {
    $(userEl).animate({
      left : mouseX,
      top : mouseY
    }, 10, 'linear');
    // gun.user().get('position').put(JSON.stringify({left : mouseX, top : mouseY}));
  }, 20)

  //USER MESSAGE
  $(messageElInput).on('keyup', (e) => {
    if(e.key === "Enter"){
      const msg = $(messageElInput).val();
      $(messageElInput).val("");
      messageElInput.blur();
      // gun.user().get('message').put(msg);
      $(userMessageEl).text(msg);
      $(userMessageEl).css('display', 'flex');
      setTimeout(() => {
        $(userMessageEl).text("");
        $(userMessageEl).css('display', 'none');
      }, 8000)
    }
  })

  //JOIN CURRENT DIMENSION AND RECIEVE THE USERS
  // let dimLoaded = false;
  // gun.user().get('currentDimension').once(async (currentDimension) => {
  //   if(!currentDimension){
  //     currentDimension = "Valoria";
  //     gun.user().get('currentDimension').put("Valoria");
  //   }
  //   const pubKeyHash = await SEA.work(gun.user()._.sea.pub, null, null, {name: "SHA-256"});
  //   gun.get(`dimension-${currentDimension}-peers#`).get(pubKeyHash).put(gun.user()._.sea.pub)
  //   //COME UP WITH A GOOD ACTIVE USER SYSTEM.
  //   gun.get(`dimension-${currentDimension}-peers#`).on((peers) => {
  //     console.log(peers);
  //     if(!peers) return;
  //     for(let peerHash in peers){
  //       const peerPub = peers[peerHash];
  //       if(peerPub === gun.user()._.sea.pub) return;
  //       gun.user(peerPub).on((peer) => {
  //         console.log(peer)
  //       })
  //     }
  //   })
  // })

}

const syncPeer = async (conn) => {
  conn.on('open', function() {
    conn.on('data', function(data) {
      if(userPeers[conn.peer]){
        if(data.raygunAvatar){
          $('.raygun-user-avatar').attr('src', data.raygunAvatar);
        }
        if(data.raygunName){
          $('.raygun-user-name').text(data.raygunName);
        }
      }else {
        console.log("Other Peer", data);
      }
    });
  });
}
