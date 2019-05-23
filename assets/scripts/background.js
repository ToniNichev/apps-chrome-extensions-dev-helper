var allRequests = {};
var lastRequestId = '';

chrome.webRequest.onBeforeRequest.addListener(function(details) {


	// ##################################################
	// Set up proxy
	// ##################################################
  	if(details.tabId != -1) {
  		var tmp1 = localStorage.proxy_rules;
  		if(tmp1 != '' && typeof tmp1 != 'undefined') {
			var proxy_rules = JSON.parse(localStorage.proxy_rules);
			//config = (typeof localStorage.config != "undefined") ? JSON.parse(localStorage.config) : config;

			// loop through proxy rules
			for(var key in proxy_rules) {
				if(proxy_rules[key].active) {
					var proxy_rule = proxy_rules[key].url;
					var proxy_type = proxy_rules[key].proxy_type;
					var proxy_location = proxy_rules[key].proxy_location;
					var proxy_port = proxy_rules[key].proxy_port;

					var regExProperties = "";
					regExProperties += proxy_rules[key].global ? 'g' : '';
					regExProperties += proxy_rules[key].caseinsensitive ? 'i' : '';

					var regex = new RegExp(proxy_rule, regExProperties);
					var match = details.url.match(regex);

					if(match !== null) {
						console.table([]);
						useProxy(proxy_type, proxy_location, proxy_port);
					}
				}
			}
	  	}

	  // ##################################################
		// Profiling
	  // ##################################################

		if(config.ui.start_profile) {
			// fill out start time if profiling is enabled
			lastRequestId = details.requestId
			var request_key = details.requestId;
			details.timeStampStart = details.timeStamp;
			allRequests[details.requestId] = details;
		}

	    // ##################################################
  		// Rewrite Rules
	    // ##################################################
  		var tmp = localStorage.rewrite_rules;
  		if(tmp != '' && typeof tmp != 'undefined') {
			var rewrite_rules = JSON.parse(localStorage.rewrite_rules);
			config = (typeof localStorage.config != "undefined") ? JSON.parse(localStorage.config) : config;

			// loop through rewrite rules
			for(var key in rewrite_rules) {
				if(rewrite_rules[key].active && rewrite_rules[key].replacement != '') {
					// if the rewrite rule is active, and the replacement is not empty (empty replacement will work for header override though)
					if(rewrite_rules[key].url!='') {
						var rewrite_rule = rewrite_rules[key].url;
						var replacement = rewrite_rules[key].replacement;
						var regExProperties = "";
						regExProperties += rewrite_rules[key].global ? 'g' : '';
						regExProperties += rewrite_rules[key].caseinsensitive ? 'i' : '';

						var regex = new RegExp(rewrite_rule, regExProperties);
						var replacementText = details.url.replace(regex, replacement);
					}
					else {
						// match everything if regex is emty
						var replacementText = rewrite_rules[key].replacement;
					}

					if(replacementText != details.url) {
						return {
							redirectUrl: replacementText /*Redirection URL*/
						};
					}
				}
			}
	  	}
  	}

}, {
  urls: ["<all_urls>"]
}, ["blocking"]);


/**
 * Request Headers override
 */
chrome.webRequest.onBeforeSendHeaders.addListener(function(details) {

	var tmp = localStorage.rewrite_rules;
	if(tmp != '' && typeof tmp != 'undefined' && details.tabId != -1) {
		var rewrite_rules = JSON.parse(localStorage.rewrite_rules);

		for(var key in rewrite_rules) {
			if(rewrite_rules[key].active) {
				var rewrite_rule = rewrite_rules[key].url;
				var regExProperties = "";
				regExProperties += rewrite_rules[key].global ? 'g' : '';
				regExProperties += rewrite_rules[key].caseinsensitive ? 'i' : '';

				var regex = new RegExp(rewrite_rule, regExProperties);
				var match = details.url.match(regex);

				if(match !== null) {
					// looping through all header overrides
					var request_header_override = rewrite_rules[key].request_header_override.split("\n");
					for(var key in request_header_override) {
						var header_name_value = request_header_override[key].split(":");
						var header_found = false;
							// looping throug current headers
							for (var i = 0; i < details.requestHeaders.length; ++i) {
								var request_header_key = details.requestHeaders[i].name.toLowerCase().trim();
								var override_header_key = header_name_value[0].toLowerCase().trim();
								if (request_header_key == override_header_key) {
									details.requestHeaders[i].value = header_name_value[1];
									header_found = true;
									break;
								}
							}
							if(header_found == false && header_name_value!='') {
						    	details.requestHeaders.push({ "name" : header_name_value[0], "value" : header_name_value[1] });
							}
					}
				}
			}
		}
	}
          return {requestHeaders: details.requestHeaders};
},
{urls: ["<all_urls>"]},
["blocking", "requestHeaders"]);



/**
 * Response Headers override
 */
chrome.webRequest.onHeadersReceived.addListener(function(details) {
	var tmp = localStorage.rewrite_rules;
	if(tmp != '' && typeof tmp != 'undefined' && details.tabId != -1) {
		var rewrite_rules = JSON.parse(localStorage.rewrite_rules);

		for(var key in rewrite_rules) {
			if(rewrite_rules[key].active) {
				var rewrite_rule = rewrite_rules[key].url;
				//var replacement = rewrite_rules[key].replacement;
				var regExProperties = "";
				regExProperties += rewrite_rules[key].global ? 'g' : '';
				regExProperties += rewrite_rules[key].caseinsensitive ? 'i' : '';

				var regex = new RegExp(rewrite_rule, regExProperties);
				var match = details.url.match(regex);

				if(match !== null) {
					// looping through all header overrides
					var response_header_override = rewrite_rules[key].response_header_override.split("\n");
					for(var key in response_header_override) {
						var header_name_value = response_header_override[key].split(":");
						var header_found = false;
							// looping throug current headers
							for (var i = 0; i < details.responseHeaders.length; ++i) {
								var response_header_key = details.responseHeaders[i].name.toLowerCase().trim();
								var override_header_key = header_name_value[0].toLowerCase().trim();
								if (response_header_key == override_header_key) {
									details.responseHeaders[i].value = header_name_value[1];
									header_found = true;
									break;
								}
							}
							if(header_found == false  && header_name_value!='') {
						    	details.responseHeaders.push({ "name" : header_name_value[0], "value" : header_name_value[1] });
							}
					}
				}
			}
		}
	}
          return {responseHeaders: details.responseHeaders};
},
{urls: ["<all_urls>"]},
["blocking", "responseHeaders"]);


chrome.webRequest.onResponseStarted.addListener(function(details) {

	if(details.tabId != -1) {
		if(config.ui.start_profile) {
			//lastRequestURL = details.url
			var request_key = details.requestId;
			//details.timeStampFirstByte = details.timeStamp;
			allRequests[details.requestId].timeStampFirstByte = details.timeStamp;
			//console.table(allRequests);
		}


	}
},
{urls: ["<all_urls>"]},
["responseHeaders"]);


/**
 * Executed on tab fully loaded
 */
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status != 'complete')
        return;
    //	config.ui.start_profile = false;

	var tmp = localStorage.scripts_settings;
	if(tmp != '' && typeof tmp != 'undefined' && tabId != -1) {
		var script_rules = JSON.parse(localStorage.scripts_settings);

		for(var key in script_rules) {
			if(script_rules[key].active) {
				var script_location = script_rules[key].script_location;
				var execute_type = script_rules[key].execute_type;
				sendMessageToThePage(script_location, execute_type);
			}
		}
	}


});





chrome.webRequest.onCompleted.addListener(function(details) {
	if( details.tabId != -1 ) {

		if(config.ui.start_profile) {
			var b =  (details.requestId == lastRequestId ? 'yes' : 'no');
			allRequests[details.requestId].timeStampEnd = details.timeStamp;
			allRequests[details.requestId].statusCode = details.statusCode;
			allRequests[details.requestId].blocking = b
			delete allRequests[details.requestId].timeStamp;
		}
	}
}, {
    urls: ["<all_urls>"]
});








//#########################################
//# Setting proxy help functions
//#########################################

function useProxy(proxy_type, proxy_location, proxy_port) {
	// Set up proxy
	var config = {
		    mode: '',
		    pacScript: {},
		    rules: {}
		};

	switch(proxy_type) {
		case 0: /* Direct */
			config.mode = "direct";
			break;

		case 1: /* System Proxy */
		    config.mode = "system";
		    config.rules.bypassList = [];
			break;

		case 2:	/* PAC File Location */
		case 3: /* PAC HTTP Location */
		case 4: /* PAC HTTP Location */
		    config.mode = "pac_script";
		    config['pacScript']['url'] = proxy_location;
			break;

		case 5:	/* Proxy HTTP Location */
		    config.mode = "fixed_servers";
		    config["rules"]['singleProxy'] = {
		        scheme: 'http',
		        host: proxy_location,
		        port: parseInt(proxy_port)
		    };
		    break;

		case 6:	/* Proxy HTTP Location */
		    config.mode = "fixed_servers";
		    config["rules"]['singleProxy'] = {
		        scheme: 'https',
		        host: proxy_location,
		        port: parseInt(proxy_port)
		    };
		    break;

	}

    chrome.proxy.settings.set({
    	value: config,
    	scope: 'regular'}, function() {});
}



function getResponseFromMessage() {

}


function sendMessageToThePage(script_location, execute_type) {
	var scriptKey =  'some key'; // $(this).parent().data('key');

	chrome.tabs.query({
		active: true,
		currentWindow: true
		}, function(tabs) {
			/* ...and send a request for the DOM info... */
			chrome.tabs.sendMessage(
					tabs[0].id,
					{ from: "popup", subject: "ScriptURL", key: scriptKey ,url: script_location, executeType: execute_type },
					/* ...also specifying a callback to be called
					 *    from the receiving end (content script) */
					getResponseFromMessage);
		}
	);
}
