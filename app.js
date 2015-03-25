/*
 *  Function: Server Code
 *  Modules API Required: node-static, http, socket.io
 *  Note: all comments are explanation of API
 *  By Shangru @2015/3/24
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path')
  , ejs = require('ejs') //new adding
  , node_static = require('node-static');

var file = new(node_static.Server)();
var app = express();
var server = http.createServer(app, function(req,res){
	file.serve(req,res);
	}).listen(3000,function(){
		console.log('Express server listening port: 3000');
		});

var usersId =[]; //stored users'id
var io = require('socket.io').listen(server);

io.sockets.on('connection', function (socket){ 
//服务器端的socket侦听"connection"的响应函数
	function log(){
		var array = [">>> Message from server: "];
	  	for (var i = 0; i < arguments.length; i++) {
	  		array.push(arguments[i]);
	 	}
	    socket.emit('log', array);
	}

	socket.on('message', function (id, message) { //收到connection回调
		log('Got message: ', id, message);
    // For a real app, should be room only (not broadcast)
		socket.broadcast.emit('message', id, message);
	});

	socket.on('sendText',function (msg){
		socket.broadcast.emit('textMsg',msg);
	});

	socket.on('create or join', function (room) {
			
		var numClients = io.sockets.clients(room).length; 

		log('Room ' + room + ' has ' + numClients + ' client(s)'); //">>> Message from server: xxx"
		log('Now equest to create or join room:', room);

		if (numClients == 0){
			socket.join(room);
			socket.emit('created', room, socket.id); //向client发送建立信号"created"
			usersId.push(socket.id); //记录连接好的socket id
			io.sockets.emit('system', socket.id, usersId,'login'); //向所有的socket发送
		} else if (numClients <= 5) {
			io.sockets.in(room).emit('join', room);
			socket.join(room);
			socket.emit('joined', room, socket.id); //向client发送"joined"信号
			usersId.push(socket.id); //记录连接好的socket id
			io.sockets.emit('system', socket.id, usersId,'login'); //向所有的socket发送
		} else { // max 5 clients
			socket.emit('full', room); //发送"full"信号
			return;
		}
		console.log("当前在线的用户有："+usersId);
		});

	socket.on('disconnect',function (room){
		usersId.splice(socket.id,1);
		var numClients = io.sockets.clients(room).length; //var numClients=usersId.length
		socket.broadcast.emit('system',socket.id,numClients,'logout');
	})
});

//express基本配置
// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views'); //set Views directory~
app.engine('.html',ejs.__express); //new adding
app.set('view engine','html'); //replace--app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/users', user.list);

/*var server = http.createServer(app).listen(app.get('port'), function(req,res){
  file.serve(req, res);
  console.log('Express server listening on port ' + app.get('port'));
});*/




//var static=require('node-static');  

//var server=require('http').createServer();  
//var app=server.listen(port);

//adapter.js:Google维护的函数库，用来抽象掉浏览器之间的差异
//var io=require('socket.io')(server).listen(app);
//io.sockets.on('connection',function(socket){
//   socket.on('XX',function(xxx){}); //是socket，不是sockets
//	 socket.on('YY',function(){})
// });
