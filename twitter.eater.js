
const
redis             = require('redis'),             // node_redis to manage the redis connection
client            = redis.createClient(),
_                 = require('lodash');  


var 
Twitter           = require('twitter'),
creds              = require('./creds.js');
tclient           = new Twitter({
  consumer_key: creds.consumer_key,
  consumer_secret: creds.consumer_secret,
  access_token_key: creds.access_token_key,
  access_token_secret: creds.access_token_secret
}),
stream            = tclient.stream('statuses/filter', {track: 'trump'});


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

      client.xadd('tweets',                         // add to the stream `tweets`
          '*',                                      // at the latest sequence
          'id',tw.id_str,                           // stream field `id` with the tweet id (in string format because JS is bad with big numbers!)
          'icon',tw.user.profile_image_url,                           // stream field `id` with the tweet id (in string format because JS is bad with big numbers!)
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
                                           