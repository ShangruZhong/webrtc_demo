'use strict';

var isChannelReady;
var isInitiator = false; //建立房间时置1
var isStarted = false; //发起会话呼叫时置1
var localStream;

//main.js为客户端实现代码
//server.js为服务器端实现代码

var pc; //定义p(eer)c(onnection)为RTCPeerConnection对象
var remoteStream;
var turnReady;

var pc_config = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};

var pc_constraints = {'optional': [{'DtlsSrtpKeyAgreement': true}]};

// Set up audio and video regardless of what devices are present.
//JSON表达
var sdpConstraints = {'mandatory': {
                      'OfferToReceiveAudio':true,
                      'OfferToReceiveVideo':true }
                    };

/////////////////////////////////////////////

var room = location.pathname.substring(1);
if (room === '') {
 room = prompt('Enter room name:');
//  room = 'foo';
} else {
  
}

//定义socket连接服务器socket=io.connect('http://localhost'或者null); 
//io是server端定义的调用socketio模块建立的对象：
//即var io=require('socket.io').listen(port);
//Server: io.sockets.on(action,function(xx){
//						xx.on('message',function(){}); //server使用message事件接收消息
//						});

var socket = io.connect();

if (room !== '') {
  console.log('Create or join room', room);
  socket.emit('create or join', room);
}

//事件驱动，
//两端可以互发消息
//socket.io可以发送emit、处理on内置事件(connect,disconnect,message)以及自定义事件
//发送事件： socket.emit(action,data,function{});
//处理事件： socket.on(action,function(data){});

//以下为socket侦听的响应事件的子函数
socket.on('created', function (room){ //第一个client加入，侦听到created
  console.log('Created room ' + room);
  isInitiator = true;
});

socket.on('full', function (room){
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room){ //第二个client加入时，socket发给第一个client，它侦听到join
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function (room){ //第二个client加入，侦听到joined
  console.log('This peer has joined room ' + room);
  isChannelReady = true;
});

socket.on('log', function (array){
  console.log.apply(console, array);
});

////////////////////////////////////////////////
//本地emit "message事件"
function sendMessage(message){
	console.log('Client sending message: ', message);
    socket.emit('message', message); 
  }

//接受处理server端发送的message事件
socket.on('message', function (message){
  console.log('Client received message:', message);
  if (message === 'got user media') {
	maybeStart();
  } else if (message.type === 'offer') { //收到的是offer连接
			if (!isInitiator && !isStarted) { //isInitiator/isStarted=0还没初始化
			  maybeStart(); //Start!
			}
			pc.setRemoteDescription(new RTCSessionDescription(message));//新建"远程会话描述"
			doAnswer();  //发送应答
		} else if (message.type === 'answer' && isStarted) { //收到的是应答answer
					pc.setRemoteDescription(new RTCSessionDescription(message));//同样新建"远程会话描述"
				} else if (message.type === 'candidate' && isStarted) { //收到的是"candidate"类型
							var candidate = new RTCIceCandidate({
							sdpMLineIndex: message.label,
							candidate: message.candidate
							}); //新建IceCandidate对象candidate
							pc.addIceCandidate(candidate); //pc添加Ice的candidate,参数是RTCIceCandidate对象
						} else if (message === 'bye' && isStarted) { //收到的是"bye"
								handleRemoteHangup(); //处理远程挂断
							}
});

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo'); //查找选择器获取本地视频对象的引用
var remoteVideo = document.querySelector('#remoteVideo');//查找选择器获取远程视频对象的引用

function handleUserMedia(stream) { //处理用户本地视频流
  console.log('Adding local stream.');
  localVideo.src = window.URL.createObjectURL(stream); //流变量->localVideo对象
  localStream = stream; //流变量->localStream
  sendMessage('got user media'); //本地发送消息'got user media'
  if (isInitiator) {
    maybeStart();
  }
}

function handleUserMediaError(error){ //处理用户媒体的错误
  console.log('getUserMedia error: ', error);
}

var constraints = {video: true,audio:true}; //定义约束video:true,audio:true
getUserMedia(constraints, handleUserMedia, handleUserMediaError); 
//HTML5函数获取视频，参数 1约束，参数2获取成功的回调函数，参数3获取失败的回调函数

console.log('Getting user media with constraints', constraints);

if (location.hostname != "127.0.0.1") {
  requestTurn('https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913');
}

function maybeStart() { //开始函数 isInitiator=1
  if (!isStarted && typeof localStream != 'undefined' && isChannelReady) {
    createPeerConnection(); //建立Peer连接，调用RTCPeerConnection
	
    pc.addStream(localStream); //添加本地视频流
    isStarted = true;  //开始标志isStarted置1
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall(); //如果初始化标志isInitiator为1后，本地发起呼叫call
    }
  }
}

window.onbeforeunload = function(e){
	sendMessage('bye'); 
}

///////////////////createPeerConnection//////////////////////

function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(null); //调用RTCPeerConnection建立新对象pc
	//pc.onXXX: Event handlers!!!
    pc.onicecandidate = handleIceCandidate; //当收到icecandidate事件，响应onicecandiate
    pc.onaddstream = handleRemoteStreamAdded;//当收到addstream事件，响应
    pc.onremovestream = handleRemoteStreamRemoved;//当收到removestream事件，响应
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
function handleRemoteStreamAdded(event) {  //添加远程流，类似于函数handleUserMedia(stream)
  console.log('Remote stream added.');
  remoteVideo.src = window.URL.createObjectURL(event.stream);  //创建event.stream对象，赋值给remoteVideo
  remoteStream = event.stream;  //远程视频流
}

//收到
function handleCreateOfferError(event){
  console.log('createOffer() error: ', e);
}

function doCall() { //响应收到"getusermedia"发起呼叫，maybeStart()中的createPeerConnection()调用
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError); 
  //创建offer
}

function doAnswer() {//响应收到"offer" 发起应答，
  console.log('Sending answer to peer.');
  pc.createAnswer(setLocalAndSendMessage, null, sdpConstraints);
   //
}

function setLocalAndSendMessage(sessionDescription) { //doCall(), doAnswer()调用
  // Set Opus as the preferred codec in SDP if Opus is present.
  sessionDescription.sdp = preferOpus(sessionDescription.sdp); //调用SD.sdp=preferOpus(SD.sdp)
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message' , sessionDescription);
  sendMessage(sessionDescription);
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

