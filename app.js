
/**
 * Module dependencies.
 */


/*
 *  Function: Server Code
 *  Modules API Required: node-static, http, socket.io
 *  Note: all comments are explanation of API
 *  Maintainer: Shangru Zhong 
 *  2014/12/1
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path');

var ejs = require('ejs'); //new adding
var app = express();

var node_static = require('node-static');
var file = new(node_static.Server)();

var server = http.createServer(app,function(req,res){
	file.serve(req,res);
}).listen(3000,function(){
	console.log('Express server listening port: 3000');
});

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

	socket.on('message', function (message) { //收到connection回调
		log('Got message: ', message);
    // For a real app, should be room only (not broadcast)
		socket.broadcast.emit('message', message);
	});

	socket.on('create or join', function (room) {//回调
			var numClients = io.sockets.clients(room).length;

			log('Room ' + room + ' has ' + numClients + ' client(s)');
			log('Request to create or join room', room);

			if (numClients == 0){
				socket.join(room);
				socket.emit('created', room); //向client发送建立信号"created"
			} else if (numClients == 1) {
				io.sockets.in(room).emit('join', room);
				socket.join(room);
				socket.emit('joined', room); //向client发送"joined"信号
			} else { // max two clients
				socket.emit('full', room); //发送"full"信号
			}
			socket.emit('emit(): client ' + socket.id + ' joined room ' + room); //向client发送信号
			socket.broadcast.emit('broadcast(): client ' + socket.id + ' joined room ' + room);//发送广播信号
		});
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
