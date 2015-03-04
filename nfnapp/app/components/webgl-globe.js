/* global Ember, THREE, TWEEN */

var EARTHRADIUS = 0.5;
var EARTHSEGMENTS = 48;
var SAMPLE_INTERVAL_MS = 100;
var WEBSOCKET_URL = "ws://localhost:8001";

// var SAN_FRANCISCO = {
//   lon: 122.41,
//   lat: 37.78
// };

export default Ember.Component.extend({

  didInsertElement: function() {
    var self = this;
    var scene = this.renderEarth();

    window.setTimeout(function() {
      self.connectWebSocket(scene);
    }, 3000);

    // msgSeq.forEach(function(msg) {
    //   self.scheduleAnimations(msg, scene);
    // });
  },


  connectWebSocket: function(scene) {
    var self = this;

    var socket = new WebSocket(WEBSOCKET_URL);

    socket.onopen = function (openEvent) {
      console.debug("WebSocket open: " + openEvent);
    };

    socket.onmessage = function(msg) {
      var msgData = JSON.parse(msg.data);
      self.scheduleAnimations(msgData, scene);
    };

    socket.onclose = function() {
      console.debug("WebSocket closed");
    };

    socket.onerror = function(error) {
      console.error(error);
    };

  },


  scheduleAnimations: function(msgData, scene) {
    var self = this;

    msgData.forEach(function(d, i) {
      window.setTimeout(function(d) {
        self.createAnimationObject(scene, d);
      }, SAMPLE_INTERVAL_MS * i, d);
    });
  },


  dotTexture: function() {
    return THREE.ImageUtils.loadTexture("/assets/images/yellowdot.png");
  }.property(),


  createDot: function() {
    return new THREE.Mesh(
      new THREE.SphereGeometry(0.0025, 6, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffff55,
        transparent: true,
        opacity: 0.7
      })
    );
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
    //scene.add(new THREE.AmbientLight(0x222222));

    var light = new THREE.DirectionalLight(0xffffff, 0.7);
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
          specular:    new THREE.Color(0x333333)
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


  // WebGL can't access cross domain so we have to proxy box art image resources.
  // Our Node server will proxy any resource that starts with "/proxyhttp/"
  convertToProxyUrl: function(actual) {
    return actual.replace("http://", "/proxyhttp/");
  },


  createAnimationObject: function(scene, sample) {
    var self = this;

    // Skip samples that don't have box art
    if(sample.artUrl === "") {
      return;
    }


    var artProxyUrl = self.convertToProxyUrl(sample.artUrl);


    // BOX ART CUBE
    var factor = 0.25;
    var w = 0.16 * factor;
    var h = 0.09 * factor;
    var d = 0.005 * factor;

    var geometry = new THREE.BoxGeometry( w, h, d );

    var boxArtMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: THREE.ImageUtils.loadTexture(artProxyUrl),
      transparent: true
    });

    var position = self.latLongToVector3(sample.lat, sample.lon, EARTHRADIUS, 0);
    var cube = new THREE.Mesh(geometry, boxArtMaterial);
    cube.position.x = position[0];
    cube.position.y = position[1];
    cube.position.z = position[2];
    cube.scale.x = 0;
    cube.scale.y = 0;
    cube.scale.z = 0;
    cube.lookAt(new THREE.Vector3(0,0,0));
    cube.name = cube.uuid;


    // LOCATION DOT
    var dotPos = self.latLongToVector3(sample.lat, sample.lon, EARTHRADIUS, 0.0025);

    var dot = this.createDot();
    dot.position.x = dotPos[0];
    dot.position.y = dotPos[1];
    dot.position.z = dotPos[2];
    dot.scale.x = 1;
    dot.scale.y = 1;
    dot.scale.z = 1;
    dot.lookAt(new THREE.Vector3(0,0,0));

    dot.name = dot.uuid;


    var obj = {
      scene: scene,
      cube: cube,
      lat: sample.lat,
      lon: sample.lon,
      dot: dot
    };

    scene.add( cube );
    scene.add( dot );
    this.animateObject(obj);

    return obj;
  },


  animateObject: function(obj) {
    var self = this;

    var start = { height: 0, scale: 0 };
    var end = { height: 0.07, scale: 1 };

    var start2 = { opacity: 1 };
    var end2 = { opacity: 0 };

    var dotStart = { opacity: 0.5, scale: 1 };
    var dotEnd = { opacity: 0, scale: 0 };


    // BOX ART ANIM
    var anim = new TWEEN.Tween(start).to(end, 1000)
      .easing( TWEEN.Easing.Cubic.Out )
      // move
      .onUpdate( function () {
        var newpos = self.latLongToVector3(obj.lat, obj.lon, EARTHRADIUS, start.height);
        obj.cube.position.x = newpos[0];
        obj.cube.position.y = newpos[1];
        obj.cube.position.z = newpos[2];
        obj.cube.scale.x = start.scale;
        obj.cube.scale.y = start.scale;
        obj.cube.scale.z = start.scale;
      })
      // fade
      .chain(new TWEEN.Tween(start2).to(end2, 1000)
        .onUpdate(function() {
          //obj.cube.material.transparent = true;
          obj.cube.material.opacity = start2.opacity;
        })
        // delete
        .onComplete(function() {
          var toRemove = obj.scene.getObjectByName(obj.cube.name);
          obj.scene.remove(toRemove);
        })
      );


    // DOT ANIM
    var dotAnim = new TWEEN.Tween(dotStart).to(dotEnd, 2000)
      .easing( TWEEN.Easing.Cubic.Out )
      // pop in and hold
      .delay(4000)
      // scale down
      .onUpdate( function () {
        obj.dot.scale.x = dotStart.scale;
        obj.dot.scale.y = dotStart.scale;
        obj.dot.scale.z = dotStart.scale;
        obj.dot.material.opacity = dotStart.opacity;
      })
      // delete
      .onComplete(function() {
        var toRemove = obj.scene.getObjectByName(obj.dot.name);
        obj.scene.remove(toRemove);

        // last anim to finish shoud do this
      });

      dotAnim.start();
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


});
