/*global Ember, THREE, TWEEN, $ */

var EARTHRADIUS = 0.5;
var EARTHSEGMENTS = 48;

var SAN_FRANCISCO = {
  lon: 122.41,
  lat: 37.78
};

export default Ember.Component.extend({

  didInsertElement: function() {
    var scene = this.renderEarth();
    this.createAnimationObject(scene, SAN_FRANCISCO.lon, SAN_FRANCISCO.lat);
  },


  renderEarth: function() {
    var webglEl = document.getElementById('webgl');
    var width  = window.innerWidth;
    var height = window.innerHeight;

    // Earth params
    var rotation = 0;   // was 6

    var scene = new THREE.Scene();

    var camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
    camera.position.z = 1.5;

    var renderer = new THREE.WebGLRenderer();

    renderer.setSize(width, height);

    //scene.add(new THREE.AmbientLight(0x333333));
    scene.add(new THREE.AmbientLight(0x555555));

    var light = new THREE.DirectionalLight(0xffffff, 0.5);
    light.position.set(5,3,5);
    scene.add(light);

    var sphere = createSphere(EARTHRADIUS, EARTHSEGMENTS);
    sphere.rotation.y = rotation;
    scene.add(sphere);

    var clouds = createClouds(EARTHRADIUS, EARTHSEGMENTS);
    clouds.rotation.y = rotation;
    scene.add(clouds);

    var stars = createStars(90, 64);
    scene.add(stars);

    var controls = new THREE.TrackballControls(camera);

    webglEl.appendChild(renderer.domElement);

    render();

    function render() {

      controls.update();

      // update all TWEEN objects
      TWEEN.update();

      // sphere.rotation.y += 0.0005;
      // clouds.rotation.y += 0.0005;

      requestAnimationFrame(render);
      renderer.render(scene, camera);
    }

    function createSphere(radius, segments) {
      return new THREE.Mesh(
        new THREE.SphereGeometry(radius, segments, segments),
        new THREE.MeshPhongMaterial({
          map:         THREE.ImageUtils.loadTexture('/assets/images/2_no_clouds_4k.jpg'),
          bumpMap:     THREE.ImageUtils.loadTexture('/assets/images/elev_bump_4k.jpg'),
          bumpScale:   0.002,
          specularMap: THREE.ImageUtils.loadTexture('/assets/images/water_4k.png'),
          specular:    new THREE.Color('grey')
        })
      );
    }

    function createClouds(radius, segments) {
      return new THREE.Mesh(
        new THREE.SphereGeometry(radius + 0.003, segments, segments),
        new THREE.MeshPhongMaterial({
          map:         THREE.ImageUtils.loadTexture('/assets/images/fair_clouds_4k.png'),
          transparent: true
        })
      );
    }

    function createStars(radius, segments) {
      return new THREE.Mesh(
        new THREE.SphereGeometry(radius, segments, segments),
        new THREE.MeshBasicMaterial({
          map:  THREE.ImageUtils.loadTexture('/assets/images/galaxy_starfield_my.png'),
          side: THREE.BackSide
        })
      );
    }

    return scene;
  },


  createAnimationObject: function(scene, lon, lat) {
    var self = this;
    var position = self.latLongToVector3(lat, lon, 0.5, 0);

    var factor = 0.5;
    var w = 0.16 * factor;
    var h = 0.09 * factor;
    var d = 0.005 * factor;

    var geometry = new THREE.BoxGeometry( w, h, d );

    THREE.ImageUtils.crossOrigin = '';
    var coverMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: THREE.ImageUtils.loadTexture('/assets/images/showgirls.webp')
    });

    var cube = new THREE.Mesh(geometry, coverMaterial);

    cube.position.x = position[0];
    cube.position.y = position[1];
    cube.position.z = position[2];

    cube.scale.x = 0;
    cube.scale.y = 0;
    cube.scale.z = 0;

    cube.lookAt(new THREE.Vector3(0,0,0));

    cube.name = cube.uuid;

    var obj = {
      scene: scene,
      cube: cube,
      lat: lat,
      lon: lon
    };

    scene.add( cube );
    this.animateObject(obj);

    return obj;
  },


  animateObject: function(obj) {
    var self = this;

    var start = { height: 0, scale: 0 };
    var end = { height: 0.1, scale: 1 };

    var start2 = { opacity: 1 };
    var end2 = { opacity: 0 };

    var anim = new TWEEN.Tween(start).to(end, 1000)
      .easing( TWEEN.Easing.Cubic.Out )
      .delay(2000) // wait before starting
      .onUpdate( function () {
        var newpos = self.latLongToVector3(obj.lat, obj.lon, 0.5, start.height);
        obj.cube.position.x = newpos[0];
        obj.cube.position.y = newpos[1];
        obj.cube.position.z = newpos[2];

        obj.cube.scale.x = start.scale;
        obj.cube.scale.y = start.scale;
        obj.cube.scale.z = start.scale;

        obj.cube.lookAt( new THREE.Vector3(0,0,0));
      })

      .chain(new TWEEN.Tween(start2).to(end2, 2000)
        .onUpdate(function() {
          obj.cube.material.transparent = true;
          obj.cube.material.opacity = start2.opacity;
        })

        .onComplete(function() {
          var toRemove = obj.scene.getObjectByName(obj.cube.name);
          obj.scene.remove(toRemove);
          obj = null;
        })
      );

      anim.start();
  },


  // convert the positions from a lat, lon to a position on a sphere.
  latLongToVector3: function(lat, lon, radius, heigth) {
      //offset input values to match earth bitmap position
      var lon2 = lon + 115;
      var lat2 = lat - 0;

      var phi = (lat2) * Math.PI / 180;
      var theta = (lon2 - 180) * Math.PI / 180;

      var x = -(radius+heigth) * Math.cos(phi) * Math.cos(theta);
      var y = (radius+heigth) * Math.sin(phi);
      var z = (radius+heigth) * Math.cos(phi) * Math.sin(theta);

      //return new THREE.Vector3(x,y,z);

      return [x,y,z];
  },



/////////////////////// DATA

  // _setup: function() {
  //   Ember.run.scheduleOnce('afterRender', this, this.startPoll);
  // }.on('init'),

  timer: null,
  startPoll: function() {
    var self = this;

    //this.drawGlobe();

    self.getMoreSamples();
    self.timer = setInterval(function() {
      self.getMoreSamples();
    }, this.timerSpeed);
  },


  existingArt: {},
  samples: [],
  tally: {},

  hoverTitle: '',
  hoverImageSrc: '',
  hoverStyle: '',


  sendServerRequest: function(query, fn) {
    $.support.cors = true;

    $.ajax({
      url: query,
      type: 'post',
      dataType: 'json',
      headers: {'Access-Control-Allow-Origin': '*' },

      success: function(data) {
        fn(data);
      }
    });
  },

  requestEventData: function(fn) {
    var self = this;
    self.sendServerRequest('http://localhost:8888?type=events', function(data) {
      fn(data);
    });
  },

  requestMovieData: function(needed, fn) {
    var self = this;
    var json;
    var fixed1, fixed2;
    var query = 'http://localhost:8888?type=movie&mids=%@'.fmt(needed);

    self.sendServerRequest(query, function(data) {
      fixed1 = data.replace(/}{/g, '},{');
      fixed2 = '{"data":[' + fixed1 + ']}';
      json = JSON.parse(fixed2);
      fn(json);
    });
  },


  // getMoreSamples: function() {
  //   var self = this;

  //   self.requestEventData(function(msg) {
  //     // parse data
  //     var dataCount = msg.data.length;
  //     var allParsed = [];
  //     var parsed;

  //     for(var k=0; k<dataCount; k++) {
  //       parsed = JSON.parse(msg.data[k]);
  //       parsed.size = parsed.events.length;
  //       allParsed.push(parsed);
  //     }

  //     //interleave data
  //     var all = [];
  //     var max = d3.max(allParsed, function(d) { return d.size; });

  //     for(var i=0; i<max; i++) {
  //       for(var j=0; j<dataCount; j++) {
  //         if(allParsed[j].size > i) {
  //           all.push(allParsed[j].events[i]);
  //         }
  //       }
  //     }

  //     // needed art
  //     var samples = self.get('samples');
  //     var existingArt = self.get('existingArt');
  //     var neededArt = [];

  //     all.forEach(function(d) {
  //       var mid = d.content['mid'];
  //       if(!(mid in existingArt)) {
  //         neededArt.push(mid);
  //       }
  //     });

  //     var needed = neededArt.join();

  //     // get art
  //     self.requestMovieData(needed, function(artResp) {
  //       artResp.data.forEach(function(d) {
  //         if(d.artworks.length > 0) {
  //           existingArt[d.id] = {
  //             title: d.title,
  //             artUrl: d.artworks[0].url
  //           };
  //         }
  //       });

  //       all.forEach(function(d, i) {
  //         if(!existingArt[d.content['mid']]) {
  //           return;
  //         }

  //         var art = existingArt[d.content['mid']];

  //         var sample = {
  //             mid: d.content['mid'],
  //             date: Date.now(),
  //             title: art.title,
  //             artUrl: art.artUrl,
  //             lng: d.content["geo.longitude"],
  //             lat: d.content["geo.latitude"],
  //         };
  //         samples.push(sample);


  //         (function plot(sample, i) {
  //           setTimeout(function() {
  //             self.plotSample(sample);
  //           }, i * self.get('plotSpeed'));
  //         })(sample, i);

  //         // update bar graph every 10 samples
  //         if(i % 10 === 0) {
  //           (function plot(i) {
  //             setTimeout(function() {
  //               self.doTally();
  //             }, i * self.get('plotSpeed'));
  //           })(i);
  //         }

  //       });

  //     }); // get art
  //   }); // get events
  // },




});
