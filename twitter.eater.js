
const
  redis             = require('redis'),             // node_redis to manage the redis connection
  client            = redis.createClient(),
  controlPlaneClient
                    = client.duplicate(),
  streamProcessor
                    = require('./streamProcessor.js'),
  _                 = require('lodash');  


var 

  Twitter           = require('twitter'),
  tclient           = new Twitter({
      consumer_key: '',
      consumer_secret: '',
      access_token_key: '',
      access_token_secret: ''}),
  stream            = tclient.stream('statuses/filter', {track: 'trump'});


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
                                             

let elementProcessors = {                        // Element processor pattern. This listens to stream (control-plane-eater) with `xread` for a events
  'tweets'   : (element) => function(done) {     // the element is the output from redis
    let 
      dataObj = _(element[1]).chunk(2).fromPairs().value(); // grab the data which is in interleaved array format (field, value, field value, ....) and convert to pairs and create an object out of it.
    done();                                      // note that we're done and we can listen again.
  }
};

streamProcessor(controlPlaneClient,Object.keys(elementProcessors),elementProcessors);


