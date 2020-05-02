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
let avatar;
let name;

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
  avatar = d.avatar;
  let userNameEl = document.createElement('div');
  userNameEl.className = 'raygun-user-name';
  $(userNameEl).text(d.name);
  name = d.name;
  $(userEl).append(userNameEl);
  $('.raygun-all').append(userEl);

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
    for(let peerId in dimPeers){
      dimPeers[peerId].send({raygunLeft : mouseX, raygunTop : mouseY});
    }
  }, 20)

  //USER MESSAGE
  $(messageElInput).on('keyup', (e) => {
    if(e.key === "Enter"){
      const msg = $(messageElInput).val();
      $(messageElInput).val("");
      messageElInput.blur();
      for(let peerId in dimPeers){
        dimPeers[peerId].send({raygunMessage : msg});
      }
      $(userMessageEl).text(msg);
      $(userMessageEl).css('display', 'flex');
      setTimeout(() => {
        $(userMessageEl).text("");
        $(userMessageEl).css('display', 'none');
      }, 8000)
    }
  })

  //JOIN CURRENT DIMENSION AND RECIEVE THE USERS
  socket.emit("Get Peers in Dimension", currentDimension);
  socket.on("Get Peers in Dimension", (peers) => {
    for(let username in peers){
      for(let peerId in peers[username]){
        if(userPeers[peerId] || dimPeers[peerId]) continue;
        dimPeers[peerId] = peer.connect(peerId);
        syncPeer(dimPeers[peerId]);
      }
    }
  })

}

const syncPeer = async (conn) => {
  conn.on('open', function() {

    if(userPeers[conn.peer]){
      conn.on('data', function(data) {
        if(data.raygunAvatar){
          avatar = data.raygunAvatar;
          $('.raygun-user-avatar').attr('src', data.raygunAvatar);
        }
        if(data.raygunName){
          name = data.raygunName;
          $('.raygun-user-name').text(data.raygunName);
        }
      });
    }else if(dimPeers[conn.peer]){
      conn.send({raygunName : name, raygunAvatar : avatar});

      let peerEl = document.createElement('div');
      peerEl.className = `raygun-peer raygun-peer-${conn.peer}`;
      let peerMessageEl = document.createElement('div');
      peerMessageEl.className = `raygun-peer-message raygun-peer-message-${conn.peer}`;
      $(peerEl).append(peerMessageEl);
      let peerAvatarEl = document.createElement('img');
      peerAvatarEl.className = `raygun-peer-avatar raygun-peer-avatar-${conn.peer}`;
      $(peerEl).append(peerAvatarEl);
      let peerNameEl = document.createElement('div');
      peerNameEl.className = `raygun-peer-name raygun-peer-name-${conn.peer}`;
      $(peerEl).append(peerNameEl);
      $('.raygun-all').append(peerEl);

      conn.on('data', (data) => {
        if(data.raygunAvatar){
          $(`.raygun-peer-avatar-${conn.peer}`).attr('src', data.raygunAvatar);
        }
        if(data.raygunName){
          $(`.raygun-peer-name-${conn.peer}`).text(data.raygunName);
        }
        if(data.raygunLeft && data.raygunTop){
          $(`.raygun-peer-${conn.peer}`).animate({
            left : data.raygunLeft,
            top : data.raygunTop
          }, 10, 'linear');
        }
        if(data.raygunMessage){
          $(peerMessageEl).text(data.raygunMessage);
          $(peerMessageEl).css('display', 'flex');
          setTimeout(() => {
            $(peerMessageEl).text("");
            $(peerMessageEl).css('display', 'none');
          }, 8000)
        }

      })

    }


  });
}
