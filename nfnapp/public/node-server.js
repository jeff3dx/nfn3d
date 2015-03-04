/* globals require, process */

// npm install
var argv = require("minimist")(process.argv.slice(2)); // https://www.npmjs.com/package/minimist
var ws   = require("nodejs-websocket");                // https://www.npmjs.com/package/nodejs-websocket
var Rx   = require("rx");

// node built in
var url  = require("url");
var http = require("http");
var path = require("path");
var fs   = require("fs");
var request = require("request");


var httpPort = argv.httpport || 7001;
var webSocketPort = argv.websocketport || 8001;
var pollInterval = argv.pollinterval || 5000;
var environment = argv.environment || "prod";

var MIME_TYPES = {
  "html": "text/html",
  "jpeg": "image/jpeg",
  "jpg": "image/jpeg",
  "png": "image/png",
  "js": "text/javascript",
  "css": "text/css",
  "webp": "image/webp"
};

var TEN_SECONDS = 10000;
var URL_EAST = 'http://citools.us-east-1.{env}.netflix.com/clientinfo/api/esi/logblobs?user=jbutsch%40netflix.com&logblobTypes=startplay&lastN=100&startSearchTimestampMsec={time}&isGeoMap=true';
var URL_WEST = 'http://citools.us-west-2.{env}.netflix.com/clientinfo/api/esi/logblobs?user=jbutsch%40netflix.com&logblobTypes=startplay&lastN=100&startSearchTimestampMsec={time}&isGeoMap=true';
var URL_EU = 'http://citools.eu-west-1.{env}.netflix.com/clientinfo/api/esi/logblobs?user=jbutsch%40netflix.com&logblobTypes=startplay&lastN=100&startSearchTimestampMsec={time}&isGeoMap=true';
var URL_BOXART = 'http://api-int-be-1283610733.us-east-1.elb.amazonaws.com:7001/jbutsch/getArtWork?videoIds={mids}&widths=200&types=sdp,personalize=true';
var NOTFOUND = -1;

// Node graceful shutdown
process.on( 'SIGINT', function() {
  console.log("\nShutting down from (Ctrl-C)");
  process.exit();
});


function getHeaders() {
  var headers = {};
  headers["Access-Control-Allow-Origin"] = "*";
  headers["Access-Control-Allow-Methods"] = "POST, GET, PUT, DELETE, OPTIONS";
  headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, Access-Control-Allow-Origin";
  return headers;
}

console.log("Hosting HTTP on port " + httpPort);
console.log("Hosting WebSocket on port " + webSocketPort);


// HTTP SERVER
http.createServer(function(req, resp) {
  try {

    // OPTION CORS requests
    if (req.method === 'OPTIONS') {
      console.log("Options request");
      optionsCorsHandler(resp);
    // other requests
    } else {
      if(req.url.indexOf("proxy") !== NOTFOUND) {
        proxyHandler(req, resp);
      } else {
        staticFileHandler(req, resp);
      }
    }

  } catch (ex) {
    console.log("Request exception: " + ex);
  }

}).on('error', function(e) {
  console.log("http.get() error: ", e);

}).listen(parseInt(httpPort, 10));



// WEBSOCKET SERVER
ws.createServer(function (websocket) {
  console.log("New connection");

  scheduleNextPoll(websocket, true);

  // websocket.on("text", function (str) {});
  // websocket.on("close", function (code, reason) {});
}).listen(webSocketPort);


// mainly for proxying image files. Client WebGL cannot
// access anything cross domain including images
function proxyHandler(req, resp) {
  // restore original resource URL
  var remoteUrl = req.url.replace("/proxyhttp/", "http://");

  request({
    url: remoteUrl
  })
  .on('error', function(e) {
    resp.end(e);
  })
  .pipe(resp);
}


function staticFileHandler(req, resp) {
  var parsedUrl = url.parse(req.url, true);

  console.log("pathname: " + parsedUrl.pathname);

  var pathname = parsedUrl.pathname;
  if(pathname.length === 0 || pathname === "/" ) {
    console.log("default index.html");
    pathname = 'index.html';
  }

  var filename = path.join(process.cwd(), pathname);

  console.log("file: " + filename);

  fs.exists(filename, function(exists) {
    if(!exists) {
      console.log("File not found: " + filename);
      resp.writeHead(404, {'Content-Type': 'text/plain'});
      resp.write('404 Not Found\n');
      resp.end();

    } else {
      var mimeType = MIME_TYPES[path.extname(filename).split(".")[1]];
      resp.writeHead(200, mimeType);

      var fileStream = fs.createReadStream(filename);
      fileStream.pipe(resp);
    }
  });
}


function optionsCorsHandler(resp) {
  var headers = getHeaders();
  resp.writeHead(200, headers);
  resp.end();
}


function scheduleNextPoll(websocket, immediate) {
  if(websocket.readyState !== websocket.OPEN) {
    console.log("WebSocket not open. Skipping.");
    return;
  }

  var interval = immediate? 0 : pollInterval;

  setTimeout(function(websocket) {
    sendNewMessage(websocket);
  }, interval, websocket);
}


function sendNewMessage(websocket) {
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

          // hash boxart id's
          boxArtSet.videos.forEach(function(boxart) {
            lookup[boxart.id] = boxart && boxart.artworks && boxart.artworks.length > 0?
              boxart.artworks[0].url :
              false;
          });

          // associate boxart with startplay events
          allEvents.forEach(function(d) {
            d.artUrl = lookup[d.mid] || '';
          });

          var msg = JSON.stringify(allEvents, null, 2);
          websocket.sendText(msg);

          scheduleNextPoll(websocket);
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
    URL_EAST.replace("{time}", time).replace("{env}", environment),
    URL_WEST.replace("{time}", time).replace("{env}", environment),
    URL_EU.replace("{time}", time).replace("{env}", environment),
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
        return [];
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
        // on errors, complete so that associated requests can continue
        obs.onCompleted();
      });

    return function() {};
  });

  return observable;
}


function getBoxArtSeq(mids) {
  // todo cache?
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
      return [];
    }

    return parsed;
  });
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


