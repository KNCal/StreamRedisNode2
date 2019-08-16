const
    express     = require('express');             // the Express HTTP framework
    enableWs    = require('express-ws');
    app         = express(),
    redis       = require('redis'),
    _           = require('lodash'),                                                               
    streamProcessor
                = require('./streamProcessor.js'),  
    EventEmitter= require('eventemitter2').EventEmitter2,  
    evEmitter   = new EventEmitter({          
        wildcard    : true
    });

enableWs(app);

let
    streamClient = redis.createClient(),
    outClient    = streamClient.duplicate(),      // this client is for outgoing streams (control plane) 
    elementProcessors = {                         // our element processors  
        'tweets'    : (el) => function(done) {    // Here we're bouncing the stream for search results...
            evEmitter.emit('tweets', el[1]);
            done();                               // loosely coupled
        }
    };

streamProcessor(                                  // stream processing framework
    streamClient,                                 // our incoming stream
    Object.keys(elementProcessors),               // which ones to process (all, in this case)
    elementProcessors                             // how to process these streams
);

function streamToWebSocket(server, eventName, route, processFn, additionalFn) {              
                                                  // This is the proxy between streams and the websocket
    "use strict";
    server.ws(route,function(ws,req) {            // routes are passed in and we generate the websocket "route"
        let proxyToWs = function(data) {          // when we get the wildcard event, this is run
            if (ws.readyState === 1) {            // make sure the websocket is not closed
                processFn.bind(this)(ws,req,data); // then we run the processing function with the correct `this` context and pass in the relevant information as arguments
            }
        };
        evEmitter.on(eventName, proxyToWs);
        evEmitter.emit(eventName);       // do the actual event assignment
        if (additionalFn) {                       // This is used for sending things back from the websocket
            additionalFn(ws,req);
        }
    
        ws.on('close',function() {                // gracefully handle the closing of the websocket
            evEmitter.off(eventName,proxyToWs);   // so we don't get closed socket responses
        });
    });
  
    return server;
}
  
  
let streamToThisApp = _.partial(streamToWebSocket,app); // make our code nicer by partially apply the arguments
streamToThisApp('tweets','/', function(ws,ignore,data) {   // websocket route `/' will be processed on events
    "use strict";
    let dataObj = _(data)                         // create a more usable object out of the redis results
        .chunk(2)                                 // linear into pairs
        .fromPairs()                              // pair into object
        .mapValues(function(v,k) {                // map values out so we can parse the correct value
          if (k === 'results') { v = JSON.parse(v); }  
          return v;
        })
        .value();                                 // return the value from the lodash pipeline
    ws.send(JSON.stringify(dataObj));          
});

app                                               // our server app
    .use(express.static(__dirname + '/static'))   // static pages (HTML)
    .listen(4000, "127.0.0.1");
  