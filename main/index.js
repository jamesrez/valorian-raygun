const socket = io('https://valoria.herokuapp.com');
let peer = new Peer({
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
let avatar;
let name;
let dimPeers = {};
let userPeers = {};

socket.on("Login User", async (d) => {
  if(!d.success) return;
  let wrapped;
  if(d.wrapped){
    wrapped = JSON.parse(d.wrapped);
  }
  const keyMaterial = await getKeyMaterial(password);
  unwrapSecretKey(wrapped.val, new Uint8Array(Object.values(wrapped.salt)), keyMaterial, async (unwrapped) => {
    startApp(d);
  })
})

$(document).ready(async () => {

  var body = document.body;
  var html = document.documentElement;

  var biggestHeight = Math.max(body.scrollHeight, body.offsetHeight,
                       html.clientHeight, html.scrollHeight, html.offsetHeight);

  //CREATE THE RAYGUN ELEMENT
  let all = document.createElement('div');
  all.className = 'raygun-all';
  $(body).prepend(all);
  $(all).css({
    height : biggestHeight,
    minHeight : biggestHeight
  })

  let waitingForAuth = setInterval(() => {
    chrome.storage.sync.get(['raygunUsername', 'raygunPassword'], (result) => {
      if(result && result.raygunUsername && result.raygunPassword && peer.id){
        username = result.raygunUsername;
        password = result.raygunPassword;
        clearInterval(waitingForAuth);
        digestMessage(result.raygunPassword, (passhash) => {
          socket.emit('Login User', {
            username : result.raygunUsername,
            password : passhash,
            peerId : peer.id
          })
        })
      }
    })
  }, 300)

})

socket.on("New User Peer", (peerId) => {
  userPeers[peerId] = peer.connect(peerId);
  console.log(peerId)
  syncPeer(userPeers[peerId]);
})

const startApp = async (d) => {
  //CREATE MESSAGE INPUT
  let messageEl = document.createElement('div');
  messageEl.className = 'raygun-message';
  let messageElInput = document.createElement('input');
  messageElInput.className = 'raygun-message-input';
  $(messageElInput).attr('placeholder', "Press <T> to Type a Message!");
  messageEl.append(messageElInput)
  $('.raygun-all').append(messageEl);

  $('input').on('focus', () => {
    userIsTyping = true;
  })
  $('input').on('blur', () => {
    userIsTyping = false;
  })

  //HOTKEYS
  $(document.body).on('keyup', (e) => {
    if(userIsTyping) return;
    if(e.key === "t"){
      messageElInput.focus();
    }
    if(e.key === "h"){
      if($('.raygun-all').css('display') === 'flex'){
        $('.raygun-all').css('display', 'none')
      }else{
        $('.raygun-all').css('display', 'flex')
      }
    }
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
    $(userEl).css({
      left : mouseX,
      top : mouseY
    });
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

  for(let peerId in d.userPeers){
    userPeers[peerId] = peer.connect(peerId);
    syncPeer(userPeers[peerId]);
  }

  //JOIN CURRENT DIMENSION AND RECIEVE THE USERS
  socket.emit("Get Peers in Dimension", currentDimension);
  socket.on("Get Peers in Dimension", (peers) => {
    for(let user in peers){
      for(let peerId in peers[user]){
        if(dimPeers[peerId] || userPeers[peerId]) continue;
        dimPeers[peerId] = peer.connect(peerId);
        syncPeer(dimPeers[peerId]);
      }
    }
  })

}

peer.on('connection', function(conn) {
  dimPeers[conn.peer] = conn;
  syncPeer(conn);
})

socket.on("Peer Has Left", async (peerId) => {
  delete dimPeers[peerId];
  $(`.raygun-peer-${peerId}`).remove();
  console.log(peerId + " has left");
})

const syncPeer = async (conn) => {
  if(userPeers[conn.peer]){
    conn.on('open', function() {
      conn.on('data', (d) => {
        if(!d) return;
        if(d.raygunAvatar){
          $('.raygun-user-avatar').attr('src', d.raygunAvatar);
        }
        if(d.raygunName){
          $('.raygun-user-name').text(d.raygunName);
        }
      })
    })
  }
  if(!userPeers[conn.peer] && dimPeers[conn.peer]){
    if(!$(`.raygun-peer-${conn.peer}`)[0]){
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
    }
    conn.on('open', function() {
      conn.on('data', (d) => {
        if(!d) return;
        if(d.raygunAvatar){
          $(`.raygun-peer-avatar-${conn.peer}`).attr('src', d.raygunAvatar);
        }
        if(d.raygunName){
          $(`.raygun-peer-name-${conn.peer}`).text(d.raygunName);
        }
        if(d.raygunLeft && d.raygunTop){
          $(`.raygun-peer-${conn.peer}`).css({
            left : d.raygunLeft,
            top : d.raygunTop
          })
        }
        if(d.raygunMessage){
          $(`.raygun-peer-message-${conn.peer}`).text(d.raygunMessage);
          $(`.raygun-peer-message-${conn.peer}`).css('display', 'flex');
          setTimeout(() => {
            $(`.raygun-peer-message-${conn.peer}`).text("");
            $(`.raygun-peer-message-${conn.peer}`).css('display', 'none');
          }, 8000)
        }
      })
      conn.send({raygunName : name, raygunAvatar : avatar});
    })
  }
}
