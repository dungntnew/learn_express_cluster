// Include the cluster module
var cluster = require('cluster');
var hash = {};
var counter = 0;


// Code to run if we're in the master process
if (cluster.isMaster) {

    // Count the machine's CPUs
    var cpus = require('os').cpus().length;
	
	// Read file and create child worker
	var fs = require('fs');
	var util = require('util');
	var _ = require('underscore');
	var file = __dirname + '/playlist.json';
	fs.readFile(file, function(err, data){
		if(err) throw err;

		data = JSON.parse(data);
		data = _.map(data, function(val){
			return val['mp3'];	
		});
		data = _.groupBy(data, function(val, num){
			return num % cpus;
		});
		_.each(data, function(val, key){
			var worker = cluster.fork();
			hash[worker.id] = {
				range: val	
			};
			
			worker.on('message', function(msg){
				var cmd 		= msg.cmd;
				var id 	= msg.id;
				
				if (cmd){
					switch(cmd) {
						case 'crawl' :
						counter++;
						range = hash[id]['range'];
						worker.send({cmd: 'crawl', range: range});
						var msg = util.format('ID: %d\n ============================\n', id);
						msg 	+=  util.format('COUNT: %d', _.size(range));

						break;
					}	
				}
			});
		});	
	});	

    // Listen for dying workers
    cluster.on('exit', function (worker) {
        // Replace the dead worker, we're not sentimental
        console.log('Worker ' + worker.id + ' died :(');
        cluster.fork();

    });

	
	// Listen for master thread dying
	process.on('exit', function(){
		console.log('Master died :(');
	});

// Code to run if we're in a worker process
} else {

    // Include needed modules
    var express = require('express');
	var _		= require("underscore");
	var util	= require("util");

    // Create a new Express application
    var app = express();
		
	// worker functions

	var crawl = function(urls){

		var tasks = [];
		
		_.each(urls, function(url, index){
			
			tasks.push(function(callback){
				
				// create file stream for each url
				var fs		= require('fs');
				var path    = require('path');
				var name = path.basename(url);
				var filepath = path.join(__dirname, 'music', name);
				var downloaded = 0;
				var file = fs.createWriteStream(filepath);		
				var progress = require('progress');
				var request = require('request');
				var req = request({
					method	: 'GET',
					uri		: url
				});
				
				req.on('response', function(data){
					var headers = data.headers;
					var length  = parseInt(headers['content-length'], 10);
					var shortName = name.substring(0, name.length > 8 ? 8: name.length);
					var bar = new progress(shortName + ': [:bar] :percent :etas', {
						complete: '=',
						incomplete: ' ',
						width: 20,
						total: length
					});

					req.on('data', function(chunk){
						bar.tick(chunk.length);
					});

					req.on('end', function(){
					});
				});

				req.pipe(file);
			});
		});

		console.log('\n');
		var async = require('async');
		async.parallel(tasks, function(err, result){
			if (err) throw err;
		});
	};

	// Listen for event from master
	process.on('message', function(msg){
		
		if (msg.cmd){
			switch(msg.cmd){
				case 'crawl':
				var urls = msg.range;
				crawl(urls);
				break;
			}
		}
	});

    // Add a basic route – index page
    app.get('/', function (req, res) {
		process.send({cmd: 'notifyRequest', job: ''});
        res.send('Hello from Worker ' + cluster.worker.id);
    });

	// Add a handler for crowler
	app.get('/crawl', function(req, res){
		process.send({cmd: 'crawl', id: cluster.worker.id});
		res.send('Worker[' + cluster.worker.id + '] start request for crawl job');
	});	

    // Bind to a port
    app.listen(3000);
}
