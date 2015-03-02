/* globals require, process */

var url =  require("url");
var Rx =   require("rx");
var http = require("http");
var path = require("path");
var fs =   require("fs");
var port = process.argv[2] || 7001;

var MIME_TYPES = {
  "html": "text/html",
  "jpeg": "image/jpeg",
  "jpg": "image/jpeg",
  "png": "image/png",
  "js": "text/javascript",
  "css": "text/css"
};

var TEN_SECONDS = 10000;
var URL_EAST = 'http://citools.us-east-1.prod.netflix.com/clientinfo/api/esi/logblobs?user=jbutsch%40netflix.com&logblobTypes=startplay&lastN=100&startSearchTimestampMsec={time}&isGeoMap=true';
var URL_WEST = 'http://citools.us-west-2.prod.netflix.com/clientinfo/api/esi/logblobs?user=jbutsch%40netflix.com&logblobTypes=startplay&lastN=100&startSearchTimestampMsec={time}&isGeoMap=true';
var URL_EU = 'http://citools.eu-west-1.prod.netflix.com/clientinfo/api/esi/logblobs?user=jbutsch%40netflix.com&logblobTypes=startplay&lastN=100&startSearchTimestampMsec={time}&isGeoMap=true';
var URL_BOXART = 'http://api-int-be-1283610733.us-east-1.elb.amazonaws.com:7001/jbutsch/getArtWork?videoIds={mids}&widths=200&types=sdp,personalize=true';


// Graceful shutdown
process.on( 'SIGINT', function() {
  console.log( "\nGracefully shutting down from (Ctrl-C)" );
  process.exit( );
});


function getHeaders() {
  var headers = {};
  headers["Access-Control-Allow-Origin"] = "*";
  headers["Access-Control-Allow-Methods"] = "POST, GET, PUT, DELETE, OPTIONS";
  headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, Access-Control-Allow-Origin";
  return headers;
}


console.log("Serving on port " + port);


http.createServer(function(req, resp) {
  try {
    if (req.method === 'OPTIONS') {
      // CORS
      optionsCorsHandler(resp);

    } else {
      // requests
      startPollingForData();

      var headers = getHeaders();
      resp.writeHead(200, headers);
      resp.end();
    }
  } catch (ex) {
    console.log("Request exception: " + ex);
  }

})

.on('error', function(e) {
  console.log("server general error: ", e);
})

.listen(parseInt(port, 10));



function optionsCorsHandler(resp) {
  console.log("Options request");
  var headers = getHeaders();
  resp.writeHead(200, headers);
  resp.end();
}


function startPollingForData() {
  var regionSamplesSeq = getRegionSamplesSeq();

  regionSamplesSeq
    .flatMap(function(regionSampleSet) {
      return regionSampleSet;
    })
    .map(function(event) { return {
      mid: event.content.mid,
      lon: event.content["geo.longitude"],
      lat: event.content["geo.latitude"],
    };
  })
  .toArray()
  .subscribe(
    function(allEvents) {

      console.log("allEvents count: " + allEvents.length);

      var mids = allEvents.map(function(d) {
        return d.mid;
      }).join();

      getBoxArtSeq(mids).subscribe(
        function(boxArtSet) {
          var lookup = {};

          // hash box art id's
          boxArtSet.videos.forEach(function(boxart) {
            lookup[boxart.id] = boxart && boxart.artworks && boxart.artworks.length > 0?
              boxart.artworks[0].url :
              false;
          });

          // associate box art with startplay events
          allEvents.forEach(function(d) {
            d.artUrl = lookup[d.mid] || '';
          });

          var msg = JSON.stringify(allEvents, null, 2);
          pushDataToWebSocket(msg);
        }
      );
    },
    function() {},
    function() {}
  );
}


function getRegionSamplesSeq() {
  var time = Date.now() - TEN_SECONDS;

  // get samples from three regions and combine them
  url = [
    URL_EAST.replace("{time}", time),
    URL_WEST.replace("{time}", time),
    URL_EU.replace("{time}", time)
  ];

  var usEastSeq = getDataForUrlSeq(url[0]);
  var usWestSeq = getDataForUrlSeq(url[1]);
  var euWestSeq = getDataForUrlSeq(url[2]);

  return Rx.Observable
    .concat(usEastSeq, usWestSeq, euWestSeq)
    .map(function(d) {
      var parsed = {};

      try {
        parsed = JSON.parse(d);
      } catch(ex) {
        console.log("could not parse region sample: " + ex);
      }

      console.log("sample count: " + parsed.events.length);

      return parsed.events;
    });
}


function getDataForUrlSeq(url) {
  var observable = Rx.Observable.create(function(obs) {
    getHttp(url, function(data) {
        obs.onNext(data);
        obs.onCompleted();
      },
        function() {
        // on errors complete so that associated requests can continue
        obs.onCompleted();
      });

    return function() {};
  });

  return observable;
}


function getBoxArtSeq(mids) {
  // todo check for cached

  var url = URL_BOXART.replace("{mids}", mids);
  var seq = getDataForUrlSeq(url);

  return seq.map(function(d) {
    var repair = d.replace(/}{/g, '},{');
    var fixed = '{"videos":[' + repair + ']}';
    var parsed = {};

    try {
      parsed = JSON.parse(fixed);
    } catch(ex) {
      console.log("could not parse box art: " + ex);
    }

    return parsed;
  });
}


function pushDataToWebSocket(data) {

  console.log("Final data: " + trunc(data));
  // TODO
  // maybe write data to file

}


function getHttp(url, fn, errFn) {
  var data = '';

  console.log("Sending " + trunc(url));

  http.get(url, function(resp) {
    resp.on('data', function(chunk) {
      data += chunk;
    });

    resp.on('end', function() {
      console.log(trunc(data));

      fn(data);
    });

    resp.on('error', function(err) {
      console.log('getHttp error: ' + err);
      if(errFn) { errFn(err); }
    });
  });
}


function trunc(text) {
  var limit = 100;

  if(text.length > limit) {
    return text.substring(0, limit) + "...";
  } else {
    return text;
  }
}


