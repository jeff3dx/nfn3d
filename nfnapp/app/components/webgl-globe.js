/*global Ember, THREE */

export default Ember.Component.extend({

  didInsertElement: function() {
    //addTrackballControls();
    this.renderEarth();
  },


  renderEarth: function() {
    var webglEl = document.getElementById('webgl');

    // if (!Detector.webgl) {
    //   Detector.addGetWebGLMessage(webglEl);
    //   return;
    // }

    var width  = window.innerWidth,
      height = window.innerHeight;

    // Earth params
    var radius   = 0.5,
      segments = 48,
      rotation = 0;   // was 6

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

    var sphere = createSphere(radius, segments);
    sphere.rotation.y = rotation;
    scene.add(sphere);

    var clouds = createClouds(radius, segments);
    clouds.rotation.y = rotation;
    scene.add(clouds);

    var stars = createStars(90, 64);
    scene.add(stars);

    var controls = new THREE.TrackballControls(camera);

    webglEl.appendChild(renderer.domElement);

    render();

    function render() {
      controls.update();
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
  }

});

// convert the positions from a lat, lon to a position on a sphere.
var latLongToVector3 = function(lat, lon, radius, heigth) {
    var phi = (lat)*Math.PI/180;
    var theta = (lon-180)*Math.PI/180;

    var x = -(radius+heigth) * Math.cos(phi) * Math.cos(theta);
    var y = (radius+heigth) * Math.sin(phi);
    var z = (radius+heigth) * Math.cos(phi) * Math.sin(theta);

    return new THREE.Vector3(x,y,z);
};
