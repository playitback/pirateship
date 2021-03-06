var request = require('request');
var url = require('url');
var async = require('async');
var magnet = require('magnet-uri');

var categories = {
	audio: {
		music: 101,
		audiobooks: 102,
		soundclips: 103,
		flac: 104,
		other: 199
	},
	video: {
		movies: 201,
		moviesdvdr: 202,
		musicvideos: 203,
		movieclips: 204,
		tvshows: 205,
		handheld: 206,
		hdmovies: 207,
		hdtvshows: 208,
		movies3d: 209,
		other: 299
	},
	application: {
		windows: 301,
		mac: 302,
		unix: 303,
		handheld: 304,
		ios: 305,
		android: 306,
		other: 399
	},
	games: {
		pc: 401,
		mac: 402,
		psx: 403,
		xbox360: 404,
		wii: 405,
		handheld: 406,
		ios: 407,
		android: 408,
		other: 499
	},
	porn: {
		movies: 501,
		moviesdvdr: 502,
		pictures: 503,
		games: 504,
		hdmovies: 505,
		movieclips: 506,
		other: 599
	},
	other: {
		ebooks: 601,
		comics: 602,
		pictures: 603,
		covers: 604,
		physibles: 605,
		other: 699
	}
};

var invalidProxies = [];

function markProxyInvalidTemporarily(proxy) {
	if(invalidProxies.indexOf(proxy.href) === -1) {
		console.log('Adding invalid PB proxy: ' + proxy.href);
		invalidProxies.push(proxy.href);
	}
}

function perror(err) {
	console.trace(err);
}

function getProxies(success, fail) {
	fail = fail || perror;

	request({
		url: 'http://proxybay.info/list.txt',
		timeout: 60000
	}, function(error, response, body) {
		if (error)
			return fail(error);

		var proxies = [url.parse('http://pirateproxy.bz')];

		/*proxies = proxies.concat(body.split('\n\n')[1].split('\n').map(function(e) {
			return url.parse(e);
		}));*/

		//proxies.pop();

		var parallel = [];

		proxies.forEach(function(proxy) {
			var invalidIndex;
		
			if((invalidIndex = invalidProxies.indexOf(proxy.href)) > -1) {
				proxies.splice(invalidIndex, 1);
				
				return;
			}
		
			parallel.push(function(callback) {
				(function(proxy) {
					var start = new Date();
					request({
						url: proxy.protocol + '//' + proxy.host,
						timeout: 2000
					}, function(error, response, body) {
						if (error)
							return callback();

						if (body.match('title="Pirate Search"') === null)
							return callback();

						proxy.ping = new Date() - start;
						callback();
					});
				})(proxy);
			});
		});

		async.parallel(parallel, function(error) {
			if (error)
				return fail(error);

			proxies = proxies.filter(function(proxy) {
				return ('ping' in proxy);
			});

			proxies.sort(function(a, b) {
				if (a.ping < b.ping) return -1;
				if (a.ping > b.ping) return 1;
				return 0;
			});

			success(proxies);
		});
	});
}

var bestProxy = null;

function getBestProxy(success, fail) {
	if (bestProxy)
		success(bestProxy);

	getProxies(function(proxies) {
		bestProxy = proxies[0];
				
		success(bestProxy);
	}, fail);
}

function parseResultsPage(body, success, fail) {
	if (body.match('<table id="searchResult">') !== null) {
		var data = body.split('detName');
		data.shift();

		data = data.map(function(e) {
			var parsed = {};
			var match = e.match(/href="(magnet:.+?)"/);

			if (match !== null) {
				parsed.magnet = magnet(match[1]);

				if ('dn' in parsed.magnet)
					parsed.magnet.dn = unescape(decodeURI(parsed.magnet.dn).replace(/[\+\.]/g, ' '));
			} else
				return undefined;
				
			var descMatch = e.match(/<font class="detDesc">(.*)<\/font>/);
			
			if(descMatch !== null) {
				var uploadedThisYearMatch 		= descMatch[1].match(/Uploaded ([0-9]{2})-([0-9]{2}).*[0-9]{2}:[0-9]{2}/);
				var uploadedPreviousYearMatch 	= descMatch[1].match(/Uploaded ([0-9]{2})-([0-9]{2}).*([0-9]{4})/);
				var sizeMatch					= descMatch[1].match(/Size ([0-9]).*(MiB|GiB)/);
								
				if(uploadedThisYearMatch !== null) {
					parsed.uploaded = new Date();
										
					parsed.uploaded.setDate(uploadedThisYearMatch[2]);
					parsed.uploaded.setMonth(uploadedThisYearMatch[1]);
				}
				
				else if(uploadedPreviousYearMatch !== null) {
					parsed.uploaded = new Date();
										
					parsed.uploaded.setDate(uploadedPreviousYearMatch[2]);
					parsed.uploaded.setMonth(uploadedPreviousYearMatch[1]);
					parsed.uploaded.setYear(uploadedPreviousYearMatch[3]);
				}
				
				if(sizeMatch !== null) {
					parsed.size 		= sizeMatch[1];
					parsed.sizeUnit 	= sizeMatch[2];
				}
			}
						
			var seedsAndLeachesMatch = e.match(/<td align="right">(\d{1,})<\/td>/g);
									
			if(seedsAndLeachesMatch !== null) {
				parsed.seeds 	= seedsAndLeachesMatch[0].replace('<td align="right">', '').replace('</td>', '');
				parsed.leaches 	= seedsAndLeachesMatch[1].replace('<td align="right">', '').replace('</td>', '');
			}

			match = e.match(/href="(\/torrent\/.+?)"/);

			if (match !== null)
				parsed.page = match[1];

			return parsed;
		}).filter(function(e) {
			return e !== undefined;
		});

		success(data);
	} else {
		return fail();
	}
}

function top(category, success, fail, tries) {
	fail = fail || perror;
	tries = tries || 1;

	if (tries > 5)
		return fail(new Error('Can not connect to the piratebay.'));

	getBestProxy(function(proxy) {
		request({
			url: proxy.protocol + '//' + proxy.host + '/top/' + category
		}, function(error, response, body) {
			if (error) {
				markProxyInvalidTemporarily(proxy);
				
				return fail(error);
			}

			parseResultsPage(body, success, function() {
				if(tries === 5) {
					markProxyInvalidTemporarily(proxy);
				}
			
				top(category, success, fail, ++tries);
			});
		});
	}, fail);
}

function search(category, query, success, fail, tries) {
	fail = fail || perror;
	tries = tries || 1;

	if (tries > 5)
		return fail(new Error('Can not connect to the piratebay.'));
		
	getBestProxy(function(proxy) {
		if(typeof proxy == 'undefined') {
			return;
		}
		
		console.log('search', proxy.protocol + '//' + proxy.host + '/search/' + query + '/0/7/' + category);
	
		request({
			url: proxy.protocol + '//' + proxy.host + '/search/' + query + '/0/7/' + category
		}, function(error, response, body) {
			if (error) {
				console.log(error);
				markProxyInvalidTemporarily(proxy);
			
				return fail(error);
			}
			
			console.log('loaded results');

			parseResultsPage(body, success, function() {
				console.log('failed to parse');
				if(tries === 5) {
					markProxyInvalidTemporarily(proxy);
				}
				
				search(category, query, success, fail, ++tries);
			});
		});
	}, fail);
}

function addInfo(results, success, fail) {
	fail = fail || perror;

	getBestProxy(function(proxy) {
		var parallel = [];

		results.forEach(function(result) {
			if ('page' in result)
				parallel.push(function(callback) {
					(function(result) {
						request({
							url: proxy.protocol + '//' + proxy.host + result.page
						}, function(error, response, body) {
							if (error)
								return callback(error);

							var match = body.match(/<a href="(http:\/\/www.imdb.com\/title\/.+?\/)"/);

							if(match !== null)
								result.imdburl = url.parse([1]);

							callback();
						});
					})(result);
				});
		});

		async.parallel(parallel, function(error) {
			if (error) {
				markProxyInvalidTemporarily(proxy);
			
				return fail(error);
			}

			success(results);
		});
	}, fail);
}

exports.categories = categories;
exports.top = top;
exports.search = search;
exports.info = addInfo;
