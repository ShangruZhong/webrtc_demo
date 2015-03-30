 'use strict';

var isChannelReady;
var isInitiator = false; //是房间创建者置1
var isStarted = false; //发起会话呼叫时置1
var localStream;  //pc.addStream(localStream)
var remoteStream = [];
var index = 0;

var pc; //定义p(eer)c(onnection)为RTCPeerConnection对象
var peerConnections = {}; //{"id1":"pc1","id2":"pc2","id3":"pc3"}
var socketId = []; //所有pc的socketIds
var localId; //本client的socketId

var turnReady;

var pc_config = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};

var pc_constraints = {'optional': [{'DtlsSrtpKeyAgreement': true}]};

// Set up audio and video regardless of what devices are present.
//JSON表达
var sdpConstraints = {'mandatory': {
                      'OfferToReceiveAudio':true,
                      'OfferToReceiveVideo':true }
                    };

//定义socket连接服务器socket=io.connect('http://localhost'或者null); 
//io是server端定义的调用socketio模块建立的对象：
//即var io=require('socket.io').listen(port);
//Server: io.sockets.on(action,function(xx){
//            xx.on('message',function(){}); //server使用message事件接收消息
//            });

var socket = io.connect();

socket.on('created', function (room,id){ //本client是创建者，收到'created'
  console.log('Created room ' + room);
  localId = id;
  var msg = "本人 "+ localId +" 创建了房间 "+room;
  showMsg(msg);
  isInitiator = true;
});

socket.on('full', function (room){
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room){ //新的client加入时，room中的所有client收到'join'
  console.log('Another peer made a request to join room ' + room);
 // console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function (room,id){ //本client成功加入，收到'joined'
  console.log('Successfully!: This peer has joined room ' + room);
  localId = id;
  isChannelReady = true;
});

socket.on('log', function (array){
  console.log.apply(console, array);
});

socket.on('textMsg',function (msg){
  showMsg(msg);
});

socket.on('system',function (id, usersId, status){
  var msg = id+" 已经 "+(status == 'login'?' 加入房间':'离开房间');
  var count = usersId.length;
  showMsg(msg);
  document.getElementById('status').textContent = "当前房间有"+ count + "人在线";
  socketId = usersId;
  console.log("system: 连接上server的socketId有  "+socketId);
});

//本地emit "message"："string"//JSONstringify(json)
function sendMessage(message){
  console.log('Client sending message: ', message);
    socket.emit('message', localId, message); 
  }

//接受处理server端发送的message事件
socket.on('message', function (id, message){
  console.log('This client received id: '+id+' \'s message:'+ message);
  if (message === 'got user media' && id != localId) {
    //maybeStart();
      console.log("$~:向新加入的id-"+id+"-发起offer，建立pc[id]！");
     //加入房间并准备好localstream后，以新加入的id作为连接pc
      AddLocalStream(id); //createPeerConnections(id) 
      doCall(id); //向新加入的id发起offer
      } else if (message.type === 'offer' && id != localId) { //收到的是offer连接
      // if(!isInitiator && !isStarted){  //当此client不是房间创建人而且本地连接没开始时
        //maybeStart(); 
      // }  
        console.log("$~:id-"+id+"-向我发起offer，建立pc[id]应答！");
        AddLocalStream(id);
        peerConnections[id].setRemoteDescription(new RTCSessionDescription(message));//新建"远程会话描述"
        doAnswer(id);  //发送应答

      } else if (message.type === 'answer'  && id !=localId ){//&& isStarted) { //收到的是应答answer
          //pc.setRemoteDescription(new RTCSessionDescription(message));//收到对方的answer后新建"远程会话描述"
          
          console.log("$~:收到id-"+id+"-的answer！");
          peerConnections[id].setRemoteDescription(new RTCSessionDescription(message));
        } else if (message.type === 'candidate'&&id != localId && isStarted ){ //收到的是"candidate"类型
              var candidate = new RTCIceCandidate({
              sdpMLineIndex: message.label,
              candidate: message.candidate
              }); //新建IceCandidate对象candidate
              //pc.addIceCandidate(candidate); //pc添加Ice的candidate,参数是RTCIceCandidate对象
              peerConnections[id].addIceCandidate(candidate);
            } else if (message === 'bye' && isStarted) { //收到的是"bye"
                handleRemoteHangup(); //处理远程挂断
              }
});

/*
 * Main 入口
 */
var startBtn = document.getElementById('startBtn');
startBtn.onclick = function(event){
  var room = location.pathname.substring(1);
  if (room === '') {
     room = prompt('Enter room name:');
    //  room = 'foo';
    } else {  
  }

  if (room !== '') {
    console.log('Create or join room', room);
    socket.emit('create or join', room); //发送room号给server，创建/加入成功后获取本地localId
  }

  //var localVideo = document.querySelector('#localVideo'); 
  var localVideo = document.getElementById('localVideo');
  //var remoteVideo = document.querySelector('#remoteVideo');
 // var remoteVideo = document.getElementById('remoteVideo');
  var videos = document.getElementById('videos');
  var constraints = {video: true, audio: true}; //定义约束video:true,audio:true
  getUserMedia(constraints, handleUserMedia, handleUserMediaError); 
  //HTML5函数获取视频，参数 1约束，参数2获取成功的回调函数，参数3获取失败的回调函数
  console.log('Getting user media with constraints', constraints);
  if (location.hostname != "127.0.0.1") {
    requestTurn('https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913');
  }
}

var sendBtn = document.getElementById('sendBtn');
sendBtn.onclick = function(event){
  var msgsInput = document.getElementById('msgInput');
  var text = msgsInput.value;
  socket.emit('sendText', text);
  var msgs = "本人: "+text;
  showMsg(msgs);
  msgsInput.value ="";
}

function showMsg(msg){
    var msgContainer = document.getElementById('historyMsg');//<div>
    var msgToDisplay = document.createElement('p');
    var date = new Date().toTimeString().substr(0, 8);
    msgToDisplay.style.color = '#123456';
    msgToDisplay.innerHTML = '<span class="timespan">(' + date + '): </span>' + msg;
    msgContainer.appendChild(msgToDisplay);
    msgContainer.scrollTop = msgContainer.scrollHeight; 
  }

/*
 * getUserMedia回调
 */
function handleUserMedia(stream) { //处理用户本地视频流，获取localstream
  console.log('Adding local stream.');
  localVideo.src = window.URL.createObjectURL(stream); //流变量->localVideo标签
  localStream = stream; //流变量->localStream
  sendMessage('got user media'); //本地发送消息'got user media'，已经获取本地视频，等待连接
 // if (isInitiator) {
    // maybeStart();
  // }
}

function handleUserMediaError(error){ //处理用户媒体的错误
  console.log('getUserMedia error: ', error);
}

/*******************************************************************************/
function maybeStart() {
  if (!isStarted && typeof localStream != 'undefined' && isChannelReady) {
    createPeerConnection(); //建立Peer连接，pc=RTCPeerConnection
    pc.addStream(localStream); //添加本地视频流
    isStarted = true;  //添加完本地视频流后，正式开始
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall(); //如果本client是房间创始者，则发起呼叫call
    }
  }
}
 
function AddLocalStream(id){
  if(!isStarted && typeof localStream != 'undefined' && isChannelReady){
    createPeerConnection(id);
    peerConnections[id].addStream(localStream);//pc.addStream(localStream);
    isStarted = true;
    console.log('本client'+('isInitiator'?'是':'不是')+'房间创建者');
  }
}

window.onbeforeunload = function(e){
  sendMessage('bye'); 
};

///////////////////createPeerConnection//////////////////////

function createPeerConnection(id) { //peerConnections[id]=new RTCPeerConnection
  try {
    var pc = new RTCPeerConnection(null); //调用RTCPeerConnection建立新对象pc
    peerConnections[id] = pc;
    pc.onicecandidate = handleIceCandidate; //当收到icecandidate事件，响应onicecandiate
    pc.onaddstream = handleRemoteStreamAdded;//当收到addstream事件，响应
    pc.onremovestream = handleRemoteStreamRemoved;//当收到removestream事件，响应
    console.log("peerConnections["+id+"]="+peerConnections);
    console.log('Created RTCPeerConnnection');
    
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
      return;
  }
}

//以下为createPeerConnection调用的事件响应函数
//收到icecandiate,onicecandidate处理IceCandidate函数，发送IceCandidate信息
function handleIceCandidate(event) { 
  console.log('handleIceCandidate event: ', event);
  if (event.candidate) { //event的属性candidte=“RTCIceCandidate” 
  //RTCIceCandidate有属性sdpMLineIndex,sdpMid,candidate
    sendMessage({  
      type: 'candidate',
      label: event.candidate.sdpMLineIndex, //SDP中m-line的下标, unsigned short
      id: event.candidate.sdpMid,  //media stream identification, DOMString
      candidate: event.candidate.candidate}); //发送candidate类型的信息
  } else {
    console.log('End of candidates.');
  }
}

//收到addstream
function handleRemoteStreamAdded(event) {  //添加远程流到pc连接，类似于函数handleUserMedia(stream)
  console.log('Remote stream added.');
  var newVideo = document.createElement("video"); //video_id = 'other-'+socketid
  newVideo.setAttribute("class","other");
  newVideo.setAttribute("autoplay","autoplay");
  newVideo.src = window.URL.createObjectURL(event.stream);  //将流绑定到newVideo标签上
  videos.appendChild(newVideo);
  remoteStream[index] = event.stream;  //远程视频流
  index++;
  //console.log(index);
}

//收到
function handleCreateOfferError(event){
  console.log('createOffer() error: ', e);
}

function doCall(id) { //peerConnections[new_id].doCall()
  console.log('Sending offer to peer');
  //pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
  var setLocalAndSendMessage = function(id){
    return function (sessionDescription) { //doCall(), doAnswer()调用
      // Set Opus as the preferred codec in SDP if Opus is present.
      sessionDescription.sdp = preferOpus(sessionDescription.sdp); //调用SD.sdp=preferOpus(SD.sdp)
      peerConnections[id].setLocalDescription(sessionDescription);
      console.log('setLocalAndSendMessage sending message(sessionDescription): ', sessionDescription);
      sendMessage(sessionDescription);
    }
  };
  peerConnections[id].createOffer(setLocalAndSendMessage(id), handleCreateOfferError);
  //创建offer
}

function doAnswer(id) {//响应收到"offer" 发起应答,peerConnections[receive_id].doAnswer()
  console.log('Sending answer to peer+ '+id);
  var setLocalAndSendMessage = function(id){
    return function (sessionDescription) { //doCall(), doAnswer()调用
      // Set Opus as the preferred codec in SDP if Opus is present.
      sessionDescription.sdp = preferOpus(sessionDescription.sdp); //调用SD.sdp=preferOpus(SD.sdp)
      peerConnections[id].setLocalDescription(sessionDescription);
      console.log('setLocalAndSendMessage sending message(sessionDescription): ', sessionDescription);
      sendMessage(sessionDescription);
    }
  };
  //pc.createAnswer(setLocalAndSendMessage, null, sdpConstraints);
  peerConnections[id].createAnswer(setLocalAndSendMessage, null, sdpConstraints);
}



function requestTurn(turn_url) { //请求TURN服务器
  var turnExists = false;
  for (var i in pc_config.iceServers) {
    if (pc_config.iceServers[i].url.substr(0, 5) === 'turn:') {
      turnExists = true; //在pc_config.iceServer[]里找到TURN服务器
      turnReady = true;
      break;
    }
  }
  if (!turnExists) { //没找到服务器，从turn_url里传入服务器
    console.log('Getting TURN server from ', turn_url);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest(); //新建XMLHttpRequest对象
    xhr.onreadystatechange = function(){
      if (xhr.readyState === 4 && xhr.status === 200) { //readyState=4 请求完成 status为响应码200表示成功响应
        var turnServer = JSON.parse(xhr.responseText);
        console.log('Got TURN server: ', turnServer);
        pc_config.iceServers.push({
          'url': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turn_url, true);
    xhr.send();
  }
}
/*
function handleRemoteStreamAdded(event) { //handleRemoteStreamAdded????
  console.log('Remote stream added.');
  remoteVideo.src = window.URL.createObjectURL(event.stream);
  remoteStream = event.stream;
}
 */

 //收到removestream，响应onremovestream，处理函数
function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

function hangup() { //挂机
  console.log('Hanging up.');
  stop();
  sendMessage('bye');
}

function handleRemoteHangup() {
//  console.log('Session terminated.');
  // stop();
  // isInitiator = false;
}

function stop() {  //开始标记isStarted=0
  isStarted = false;
  pc.close();
  pc = null;
}


/////////////////preferOpus//////////////

// Set Opus as the default audio codec if it's present.
function preferOpus(sdp) {
  var sdpLines = sdp.split('\r\n');
  var mLineIndex;
  // Search for m line.
  for (var i = 0; i < sdpLines.length; i++) {
      if (sdpLines[i].search('m=audio') !== -1) {
        mLineIndex = i;
        break;
      }
  }
  if (mLineIndex === null) {
    return sdp;
  }

  // If Opus is available, set it as the default in m line.
  for (i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('opus/48000') !== -1) {
      var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
      if (opusPayload) {
        sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
      }
      break;
    }
  }

  // Remove CN in m line and sdp.
  sdpLines = removeCN(sdpLines, mLineIndex);

  sdp = sdpLines.join('\r\n');
  return sdp;
}

function extractSdp(sdpLine, pattern) {//preferOpus调用
  var result = sdpLine.match(pattern);
  return result && result.length === 2 ? result[1] : null;
}

// Set the selected codec to the first in m line.
function setDefaultCodec(mLine, payload) { //preferOpus调用
  var elements = mLine.split(' ');
  var newLine = [];
  var index = 0;
  for (var i = 0; i < elements.length; i++) {
    if (index === 3) { // Format of media starts from the fourth.
      newLine[index++] = payload; // Put target payload to the first.
    }
    if (elements[i] !== payload) {
      newLine[index++] = elements[i];
    }
  }
  return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready.
function removeCN(sdpLines, mLineIndex) {//preferOpus调用
  var mLineElements = sdpLines[mLineIndex].split(' ');
  // Scan from end for the convenience of removing an item.
  for (var i = sdpLines.length-1; i >= 0; i--) {
    var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
    if (payload) {
      var cnPos = mLineElements.indexOf(payload);
      if (cnPos !== -1) {
        // Remove CN payload from m line.
        mLineElements.splice(cnPos, 1);
      }
      // Remove CN line in sdp
      sdpLines.splice(i, 1);
    }
  }

  sdpLines[mLineIndex] = mLineElements.join(' ');
  return sdpLines;
}

