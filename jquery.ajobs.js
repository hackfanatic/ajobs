/*!
 * inspired-by: http://plugins.jquery.com/project/AjaxManager
 * repository: https://github.com/hackfanatic/ajobs
 * @author Shaabi Mohammed
 * @version 1.0
 * Copyright 2012, Shaabi Mohammed
 * Licensed under GPL Version 2
 */

(function( $ ) {
	"use strict";

	/* Variables */ 
	var ajobs = {}, ajobcache = [];
	
	/* Extend Storage cache to handle objects */
	Storage.prototype.setObject = function(key, value) {
    	this.setItem(key, JSON.stringify(value));
	}

	Storage.prototype.getObject = function(key) {
		var value = this.getItem(key);
		return ( value !== 'undefined' ) ? JSON.parse(value) : false;
	}

	/* List Manager Object */
	$.ajobs = {
		create: function(job_name, options) {
			// if queue doesnt already exist
			if ( !ajobs[job_name] ) {
				ajobs[job_name] = new $.ajobs.taskList(job_name, options);
				// initialize cache
				this._createCache(job_name, options.cacheType);
				return ajobs[job_name];
			} else {
				// already created return existsing object
				console.log(job_name + ' already exists!');
				return false;
			}

		},

		destroy: function() {
			// TODO create proper destroy
			// Remove Associated caches
			// Remove associated jobs

			//ajobs[job_name].abort();
			//delete ajobs[job_name];
		},

		/* Caching Functions */
		_createCache: function(job_name, type) {
			var selectedCache = null;
			// Detect storage option
			switch(type){
				case 'var':
					selectedCache = this._tempStorage();
					break;
				case 'sessionStorage':
					// set localStorage
					if (typeof(Storage)!=="undefined"){
						selectedCache = sessionStorage;
					} else selectedCache = this._tempStorage(); // fallback to VAR
					break;
					// set sessionStorage
				case 'localStorage':
					if (typeof(Storage)!=="undefined"){
						selectedCache = localStorage;
					} else selectedCache = this._tempStorage(); // fallback to VAR
					break;
				default:
					console.log('Invalid Cache Type : ' +type);
			} 

			ajobcache[job_name] = selectedCache;
			console.log('initialized cache '+ type);
		},

		_tempStorage: function () {
			return {
				mem : [],
				setObject : function(key, val){
					this.mem[key] = val;
				},
				getObject : function(key, val){
					return this.mem[key];
				}
			}
		}
	}


	/* Default settings */
	$.ajobs.defaults = {
		cacheType: 'none', // none, var, localStorage, sessionStorage
		noDuplicate: true,
		ajaxCache: false, // local ajax cache, keep false
		cacheTTL: -1, // time to automated expiry in seconds
		header: '' // Accept: application/json; version=1; client=live;
	};

	/* aJob Objects */
	$.ajobs.taskList = function (job_name, options){
		this.job_name = job_name;
		this.list = {};
		this.status = 0 , // 0 IDLE, 1 RUNNING, 2 DONE, 3 ABORT
		this.inProgress = 0,
		this.options = new $.extend({}, $.ajobs.defaults, options);// {} required for default options sanity
	}

	// CLASS quite heavy need to simplify
	$.ajobs.taskList.prototype = {
		// add to this tasklist
		run: function(task_id, url, data, type, callback) {
			var self=this;
			if(!this._canBeAdded(task_id, url, false/*not a resource*/)) return;

			// try executing from cache first else create new request
			if( this._tryRunFromCache(task_id, callback) ){
				console.log('XHR-ing : ' + task_id);
				// new request add to list and start
				this.list[task_id] = new this._ajobObject({
					'task_id'		: task_id ,
					'orig_url'		: url ,
					'type'			: type ,
					'data'			: data,
					'callback'		: callback,
					'headers'		: { Accept : self.options.header } , 

					/* Overloading */
					'success'		: function (data, status, xhr) {
						//Store in the cache
						self._addToCache(task_id, data);		

						// run callback function
						self._runCallback(data, status, callback);
					},
					'complete' 		: function (xhr, status) { self._minusProgress(); }
				});
				
				// run new ajax request and execute callback
				console.log('header :' +self.options.header)
				$.ajax(this.list[task_id]);
			}
		},

		runResource: function(url, req_var ,type, resource_list) {
			var self = this;
			var talk_resources = [];

			$.each(resource_list, function(res_id, resource) {
				// Check if this is cached & run
				if( self._tryRunFromCache(resource.task_id, resource.callback) ){
					// If i can be added
					if(self._canBeAdded(resource.task_id, url, true/*not a resource*/)){
						talk_resources.push(resource);
						delete resource_list[res_id];
					}
				}
			});

			// Create data dict
			var data = {};
			data[req_var] = talk_resources;
			
			// try executing from cache first else add
			if(talk_resources.length > 0){
				var res_call  = new this._ajobObject({
					'task_id'		: 'resource_call' ,
					'orig_url'		: url ,
					'type'			: type ,
					'data'			: data,
					'callback'		: this._resourceCallback,
					/* Overloading */
					'success'		: function(data, status, xhr){
						console.log(self.job_name + ' ; NOT storing : ' + this.task_id);
						self._resourceCallback(data, status, talk_resources)
					},
					'complete' 		: function (xhr, status) { self._minusProgress(); }
				});

				// callback
				$.ajax(res_call);
			}
		},

		// if id already exists
		_canBeAdded: function(task_id, url, resource){
			if( typeof this.list[task_id] !== 'undefined' ){
				// if paths match
				if( (this.list[task_id].orig_url != url) && !resource ){
					console.log('Cannot run '+task_id+' with a different URL (' + this.list[task_id].orig_url + ', ' + url + ')' );
					return false;
				}

				if( this.options.noDuplicate == true && this.status < 2){
					//TODO check if task_id is actually running
					console.log('task with id already running, not adding ' + task_id);
					return false;
				}
			}
			// ok to add
			return true;
		},

		_tryRunFromCache: function(task_id, callback) {
			// if result is from cache
			this.inProgress++;
			var result = this._getFromCache(task_id);

			if ( result ) {
				console.log('Running from cache : ' + task_id);
				this.list[task_id] = result;

				// execute callback
				if(callback) callback(result.content, 'cache');
				this._minusProgress();
				
				return false; // success so dont re run request
			} return true;
		},

		_resourceCallback : function(data, status, resource_list){
			var self = this;
			/* Break down the call into its own counterparts */
			$.each(resource_list, function(res_id, resource) {
				console.log(self.job_name + '; storing from resource : ' + resource.task_id);
				
				self._addToCache(resource.task_id, data, resource.talk); // storing only subset

				// call callback
				self._runCallback(data, status, resource.callback);
			});
		},

		_addToCache : function(task_id, data, subset) {
			// add if caching is enabled
			if (this.options.cacheType != 'none'){
				console.log(this.job_name + '; storing : ' + task_id);
			
				var obj_data = JSON.parse(data);
				var sub_data = (typeof subset === 'undefined' ) ? obj_data : obj_data[subset];
			
				ajobcache[this.job_name].setObject(this._taskCID(task_id), {
					/* Cache OBJECT */
					'timestamp'	: (new Date().getTime()),
					'content'	: sub_data
				});
			}
		},

		// check in the cache
		_getFromCache : function(task_id){
			if ( this.options.cacheType != 'none' && ajobcache[this.job_name] ) {
				// check if ttl valid, if yes return object
				var obj = ajobcache[this.job_name].getObject(this._taskCID(task_id));
				return (this._checkTTL(obj)) ? obj : false;
			} else return false; // not in cache
		},

		// execute the callback 
		_runCallback : function(data, status, callback) {
			var obj_data = JSON.parse(data);
			if(typeof callback !== 'undefined') callback(obj_data, status); else console.log('no callback');
		},

		_checkTTL : function(obj){
			var current_time = new Date().getTime();
			// check if object exists, TTL is forever or if ttl has expired
			//console.log(':'+(this.options.cacheTTL < 0)+':'+this.options.cacheTTL + ":" + (current_time - ( obj.timestamp + this.options.cacheTTL)) /*expiry*/)
			return ( ( obj !== null ) && ( ( this.options.cacheTTL < 0 /*forever*/ ) || ( current_time < ( obj.timestamp + this.options.cacheTTL) /*expiry*/)) ) ? true : false;
		},

		_taskCID : function (task_id){
			return this.job_name+'.'+task_id;
		},

		/* ajobObj This needs to dissolve */
		_ajobObject : function(params) {
			var object = {
				'url'			: params.orig_url ,
				'async'			: true ,
				'xhrFields'		: { withCredentials: true } ,
				'cache'			: false
			}

			// Return Final AJAX object
			return $.extend(object, params);
		},

		/* End ajobObj */
		_minusProgress: function(){
			this.inProgress--;
					
			if ( !this.inProgress ) {
				this.status = 2; 
			} else {
				this.status = 1; // working
			}
		}
	}

})( jQuery );