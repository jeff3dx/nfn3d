import Ember from 'ember';
import config from './config/environment';

var Router = Ember.Router.extend({
  location: config.locationType
});

Router.map(function() {
  this.route('globe');
  this.route('globe', {path: '/'});
  this.route('globe', {path: '/globe'});
});

export default Router;
