 'use strict';

var localVideo = document.getElementById('localVideo');
var videos = document.getElementById('videos');

var isChannelReady = {}; //建立socket时isChannel[id]=ture
var isInitiator = false; //是房间创建者置1
var isStarted = {};  //发起会话呼叫时isStarted[id]=true 
var localStream;  //pc.addStream(localStream)
var remoteStream = [];
var index = 0;

var pc; //定义p(eer)c(onnection)为RTCPeerConnection对象
var peerConnections = {}; //{"id1":"pc1","id2":"pc2","id3":"pc3"}
var socketId = []; //所有pc的socketIds
var localId; //本client的socketId

var turnReady;

var pc_config = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}
                                {'url': 'turn:user@turnserver.com','credemtial':'pass'}
                               ]};
var pc_constraints = {'optional': [{'DtlsSrtpKeyAgreement': true}]};
var constraints = {video: true, audio: true}; //定义约束video:true,audio:true
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
//						xx.on('message',function(){}); //server使用message事件接收消息
//						});

var socket = io.connect();

socket.on('created', function (room,id){ //本client是创建者，收到'created'
  console.log('Created room ' + room);
  localId = id;
  var msg = localId +" 创建了房间 "+room;
  showMsg('本人'+msg);
  isInitiator = true;
  isChannelReady[localId] = true;
  console.log(isChannelReady);
  getUserMedia(constraints, handleUserMedia, handleUserMediaError); 
  console.log('Getting user media with constraints', constraints);
});

socket.on('full', function (room){
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room,id){ //新的client加入时，room中的所有client收到'join'
  console.log('id为'+ id +' 请求加入房间 ' + room);
  //isChannelReady[id] = true; 
  console.log(isChannelReady);
});

socket.on('joined', function (room,id){ //本client成功加入，收到'joined'
  console.log('Successfully!: This peer has joined room ' + room);
  localId = id;
  isChannelReady[localId] = true;
  console.log(isChannelReady);
  getUserMedia(constraints, handleUserMedia, handleUserMediaError); 
  console.log('Getting user media with constraints', constraints);
});

socket.on('log', function (array){
  console.log.apply(console, array);
});

socket.on('textMsg',function (id, msg){
  showMsg(id,msg);
});

socket.on('system',function (id, usersId, status){
  var msg = " 已经 "+(status == 'login'?' 加入房间':'离开房间');
  var count = usersId.length;
  showMsg(id,msg);
  document.getElementById('status').textContent = "当前房间有"+ count + "人在线";
  socketId = usersId;
  console.log("system: 连接上server的socketId有  "+socketId);
});

//本地emit "message"："string"//JSONstringify(json)
function sendMessage(message){
	console.log('本客户端发送message: ', message);
    socket.emit('message', localId, message); 
  }

//接受处理server端发送的message事件
socket.on('message', function (id, message){
  console.log('$~:客户端收到 id: '+id+' 的message:'+ message);
  if (message === 'got user media' && id != localId) { //收到非本客户端的获取local stream成功
    //maybeStart();
      isStarted[id] = false;
      console.log("$~:向新加入的id-"+id+"-发起offer，建立pc[id]！");
     //加入房间并准备好localstream后，以新加入的id作为连接pc
      AddLocalStream(id); //createPeerConnections(id) 
      doCall(id); //向新加入的id发起offer
      } 
      else if (message.type === 'offer' && id != localId) { //收到的是offer连接
			// if(!isInitiator && !isStarted){  //当此client不是房间创建人而且本地连接没开始时
			  //maybeStart(); 
			// }  
        console.log("$~:id-"+id+"-向我发起offer，建立pc[id]应答！");
        isStarted[id]=false;
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
						} else if (message === 'bye' && isStarted[id]) { //收到的是"bye"
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
  //var remoteVideo = document.querySelector('#remoteVideo');

  if (location.hostname != "127.0.0.1") {
    requestTurn('https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913');
  }
}

var sendBtn = document.getElementById('sendBtn');
sendBtn.onclick = function(event){
  var msgsInput = document.getElementById('msgInput');
  var text = msgsInput.value;
  socket.emit('sendText', localId, text);
  //var msgs = "本人: "+text;
  showMsg('本人',text);
  msgsInput.value ="";
}

function showMsg(id,msg){
    var msgContainer = document.getElementById('historyMsg');//<div>
    var msgToDisplay = document.createElement('p');
    var date = new Date().toTimeString().substr(0, 8);
    if(id=='本人'){
      msgToDisplay.style.color = '##f1558f';
    }
    else msgToDisplay.style.color = '#000000';
    msgToDisplay.innerHTML = '<span class="timespan">(' + date + '): </span>'+id+':' + msg;
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
 
function AddLocalStream(id){
  console.log('isStarted[id]='+isStarted[id]);
  console.log('isChannelReady[id]='+isChannelReady[localId]);
  if(!isStarted[id] && typeof localStream != 'undefined' && isChannelReady[localId]){
    createPeerConnection(id);
    peerConnections[id].addStream(localStream);//pc.addStream(localStream);
    isStarted[id] = true;
    console.log('This client isInitiator?:'+isInitiator);
  }                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         
}

window.onbeforeunload = function(e){
	sendMessage('bye'); 
};

function createPeerConnection(id) { //peerConnections[id]=new RTCPeerConnection
  try {
    var pc = new RTCPeerConnection(pc_config); //调用RTCPeerConnection建立新对象pc
    pc.onicecandidate = handleIceCandidate; //当收到icecandidate事件，响应onicecandiate
    pc.onaddstream = handleRemoteStreamAdded;//当收到addstream事件，响应
    pc.onremovestream = handleRemoteStreamRemoved;//当收到removestream事件，响应
    peerConnections[id] = pc;
    console.log("peerConnections["+id+"]="+peerConnections);
    console.log('成功建立RTCPeerConnnection');
    
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

//收到aremote stream，
function handleRemoteStreamAdded(event) {  //添加远程流到pc连接，类似于函数handleUserMedia(stream)
  var newVideo = document.createElement("video"); //video_id = 'other-'+socketid
  newVideo.setAttribute("class","other");
  newVideo.setAttribute("autoplay","autoplay");
  newVideo.src = window.URL.createObjectURL(event.stream);  //将流绑定到newVideo标签上
  videos.appendChild(newVideo);
  remoteStream[index] = event.stream;  //远程视频流
  index++;
  console.log('Remote stream added, index='+index);
}

function handleCreateOfferError(event){
  console.log('createOffer() error: ', e);
}

function doCall(id) { //peerConnections[new_id].doCall()
  console.log('Sending offer to peer+ '+id);
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
  peerConnections[id].createAnswer(setLocalAndSendMessage(id), null, sdpConstraints);
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

