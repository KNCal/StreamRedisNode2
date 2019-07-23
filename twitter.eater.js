const
  express       = require('express');           // the Express HTTP framework

const enableWs = require('express-ws');

const app = express();
enableWs(app);


const
  async         = require('async'),
  redis         = require('redis'),             // node_redis to manage the redis connection
  client        = redis.createClient(),

  EventEmitter  = require('eventemitter2').EventEmitter2,  // Allows for events with wildcards
  evEmitter     = new EventEmitter({            // init event emitter
    wildcard    : true
  });

var Twitter = require('twitter');
 
var tclient = new Twitter({
  consumer_key: '',
  consumer_secret: '',
  access_token_key: '',
  access_token_secret: ''
});

var stream = tclient.stream('statuses/filter', {track: 'trump'});

stream.on('data', function(tweet) {
  // console.log(tweet);
});

let perSec = 0; 

stream.on('data', function (tw) {             
  "use strict";
  perSec += 1;
  if (tw.entities != undefined) {                              
    let 
      tweetEntities = tw.entities,                        
      mentions = tweetEntities.user_mentions
        .map((mention) => mention.screen_name)  // extract mentions
        .join(','),                             // results in a comma delimited list of screen names mentioned
      urls = tweetEntities.urls           
        .map((aUrlEntity) => aUrlEntity.url)    // extract URL
        .join(',');                             // results in a comma delimited list of URLs

    client.xadd('tweets',                       // add to the stream `tweets`
      '*',                                      // at the latest sequence
      'id',tw.id_str,                           // stream field `id` with the tweet id (in string format because JS is bad with big numbers!)
      'screen_name',tw.user.screen_name,        // stream field `screen_name` with the twitter screen name
                                                // stream field `text` with either the extended (>140 chars), if present, or normal if (<140 chars)
      'text',(tw.extended_tweet && tw.extended_tweet.full_text) ? tw.extended_tweet.full_text : tw.text,
      'mentions',mentions,                      // stream field `mentions` with the mentions comma delimited list
      'urls',urls,                              // stream field `urls` with urls comma delimited list
      function(err) {
          if (err) { throw err; }               // handle any errors - a production service would need better error handling.
      }
    );
  }
});

setInterval(function() {                    
  "use strict";
  console.log('Tweets per/sec',perSec);
  perSec = 0;                                
},1000); 

stream.on('error', function (err) {          
  "use strict";
  console.error('Twitter Error', err);       
});                                          
                                             
async.forever(                       
  function(done) {                           
    client.xread(                     
      'BLOCK',                          
      5000,
      'STREAMS',
      'tweets',
      '$',
      // emit the payload should be here...ß
      (el) => function(done) {                                                             
      evEmitter.emit('tweet-data',...)  
        done();  //need done() here
      },
      // test code
      function(done) {                                        
        evEmitter.emit('tweet-data', 'Sending to client'); 
      }
    );
  },        

  function(err) {  
    throw err;                                // this should only happen if there is an error
    // do more here                           // otherwise, throw.
  }
);

app.ws('/',function(ws,req) {
  console.log("Got here");
  let proxyToWs = function(data) {  
    ws.on('message', msg => {
      if (ws.readyState === 1) {               // make sure the websocket is not closed
        "use strict";
        ws.send(JSON.stringify(data));
        console.log("Sending data to client");
        // the following are example code only 
        // ws.send(data[1]);   
        // ws.send(JSON.stringify(data.filter((ignore,i) => i % 2 ))); // send the data - we actually don't need the ranking (just the order), so we can filter out ever other result!
      }
    });  
  };

  evEmitter.on('tweet-data', proxyToWs); 

  // this code is saved for later when front end initiates close connection
  // ws.on('close', () => {                        // gracefully handle the closing of the websocket
  //   evEmitter.off('tweet-data',proxyToWs);      // so we don't get closed socket responses
  //   console.log('Connection closed')
  // });

});

app                                             // our server app
  .use(express.static(__dirname + '/static'))   // static pages (HTML)
  .listen(4000, "127.0.0.1");
