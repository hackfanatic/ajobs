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
	var ajobs = {}, ajobcache = []; var cacheInit = false;
	
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
			ajobs[job_name].abort();
			delete ajobs[job_name];
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
			//this._makelist();
			// made cache queue
			
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
		cacheTTL: -1 // time to automated expiry in seconds
	};

	/* aJob Objects */
	$.ajobs.taskList = function (job_name, options){
		this.job_name = job_name;
		this.list = {};
		this.status = 0 , // 0 IDLE, 1 RUNNING, 2 DONE, 3 ABORT
		this.inProgress = 0,
		this.options = new $.extend({}, $.ajobs.defaults, options);// {} required for default options sanity
	}

	$.ajobs.taskList.prototype = {
		// add to this tasklist
		run: function(task_id, url, type, callback){
			// if id already exists
			if( this.list[task_id] !== undefined ){
				// if paths match
				if( this.list[task_id].orig_url != url ){
					console.log('Cannot run '+task_id+' with a different URL');
					return;
				}

				if( this.options.noDuplicate == true && this.status < 2){
					console.log('task with id already running, not adding ' + task_id);
					return;
				}
			}
			
			// if object in cache
			this.inProgress++;
			var res = this.check(task_id);
			if( res ) {
				this.list[task_id] = res;
				callback(res.data, 'cache');
				this._minusProgress();
			} else {
				console.log('ajaxing : ' + task_id);
				// new request add to list and start
				this.list[task_id] = new this._ajobObject(task_id, url, type, callback, this.options, this);
				
				// run new ajax request and execute callback
				$.ajax(this.list[task_id]);
			}
		},

		// check in the cache
		check: function(task_id){
			if ( this.options.cacheType != 'none' && ajobcache[this.job_name] ) {
				// check if ttl valid, if yes return object
				var obj = this._getFromCache(task_id);
				return  this._checkTTL(obj);
			} else return false; // not in cache
		},

		_checkTTL : function(obj){
			var current_time = new Date().getTime();
			// check if object exists, TTL is forever or if ttl has expired
			//console.log(':'+(this.options.cacheTTL < 0)+':'+this.options.cacheTTL + ":" + (current_time - ( obj.timestamp + this.options.cacheTTL)) /*expiry*/);
			return ( ( obj !== null ) && ( ( this.options.cacheTTL < 0 /*forever*/ ) || ( current_time < ( obj.timestamp + this.options.cacheTTL) /*expiry*/)) ) ? obj : false;
		},

		// abort any further requests from this tasklist
		abort: function() {
			// set to aborted state
			this.status = 3;
		},

		// destroy this task
		destroy: function() {
			ajobs[self.job_name].abort();
			delete ajobs[this.job_name];
		},

		_addToCache : function(task_id, obj) {
			ajobcache[this.job_name].setObject(this._taskCID(task_id), obj);
		},

		_getFromCache : function(task_id){
			return ajobcache[this.job_name].getObject(this._taskCID(task_id));
		},

		_taskCID : function (task_id){
			return this.job_name+'.'+task_id;
		},

		/* ajobObj */
		_ajobObject : function(task_id, url, type, callback, options, parent){
			var self = this;
			
			return {
				'id'			: task_id ,
				'orig_url'		: url ,
				'url'			: url ,
				'type'			: type ,
				'timestamp' 	: new Date().getTime() ,
				'async'			: true ,
				//'headers'		: { Accept : accept_string } ,
				'xhrFields'		: { withCredentials: true } ,
				'cache'			: options.ajaxCache,
				'callback' 		: function(data, status) {
					// invoke passed functions
					callback(data, status);
				} ,
				// functions
				'beforeSend' 	: function(xhr, opts) {
					// dont make reqest if list is done or aborted
					if(self.status >= 2){
						// Todo pause it for now then resume after high prio ones
						return false;
					}

				} ,
				'complete' 		: function (xhr, status) {
					parent._minusProgress();
				} ,
				'success'		: function (data, status, xhr) {
					//Store in the cache
					console.log(parent.job_name + '; storing : ' + task_id);
					if(options.cacheType != 'none'){
						parent._addToCache(task_id, { 
							'timestamp' : this.timestamp,
							'orig_url' : this.orig_url,
							'data' : data 
						});
					}
					// run callback function
					this.callback(data, status);
				}
			}
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