importScripts("config.js");

var allRequests = {};
var lastRequestId = "";

var state = {
	config: cloneValue(config),
	rewrite_rules: {},
	proxy_rules: {},
	scripts_settings: {}
};

var STORAGE_DEFAULTS = {
	config: cloneValue(config),
	rewrite_rules: {},
	proxy_rules: {},
	scripts_settings: {}
};

loadStateFromStorage();

chrome.storage.onChanged.addListener(function(changes, areaName) {
	if (areaName !== "local") {
		return;
	}

	Object.keys(changes).forEach(function(key) {
		if (typeof state[key] !== "undefined") {
			state[key] = typeof changes[key].newValue === "undefined"
				? cloneValue(STORAGE_DEFAULTS[key])
				: cloneValue(changes[key].newValue);
		}
	});
});

chrome.runtime.onInstalled.addListener(function() {
	chrome.storage.local.get(null, function(items) {
		var nextState = normalizeStoredState(withLegacyFallback(items));
		chrome.storage.local.set(nextState);
	});
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
	if (!message || !message.type) {
		return false;
	}

	switch (message.type) {
		case "GET_PROFILE_STATE":
			sendResponse({
				startProfile: !!state.config.ui.start_profile,
				allRequests: allRequests,
				iframeBaseUrl: state.config.app_settings.iframe_base_url
			});
			return false;

		case "SET_PROFILING":
			setProfilingState(!!message.enabled, function(response) {
				sendResponse(response);
			});
			return true;
	}

	return false;
});

chrome.webRequest.onResponseStarted.addListener(function(details) {
	if (details.tabId === -1 || !state.config.ui.start_profile) {
		return;
	}

	if (allRequests[details.requestId]) {
		allRequests[details.requestId].timeStampFirstByte = details.timeStamp;
	}
}, {
	urls: ["<all_urls>"]
}, ["responseHeaders"]);

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
	if (changeInfo.status !== "complete" || tabId === -1) {
		return;
	}

	eachActiveRule(state.scripts_settings, function(rule) {
		if (!rule.script_location) {
			return;
		}

		sendMessageToThePage(tabId, rule.script_location, rule.execute_type);
	});
});

chrome.webRequest.onCompleted.addListener(function(details) {
	if (details.tabId === -1 || !state.config.ui.start_profile) {
		return;
	}

	if (!allRequests[details.requestId]) {
		return;
	}

	allRequests[details.requestId].timeStampEnd = details.timeStamp;
	allRequests[details.requestId].statusCode = details.statusCode;
	allRequests[details.requestId].blocking = details.requestId === lastRequestId ? "yes" : "no";
	delete allRequests[details.requestId].timeStamp;
}, {
	urls: ["<all_urls>"]
});

registerMv3CompatibleRequestHandlers();

function loadStateFromStorage() {
	chrome.storage.local.get(null, function(items) {
		var nextState = normalizeStoredState(withLegacyFallback(items));
		state = nextState;
		chrome.storage.local.set(nextState);
	});
}

function registerMv3CompatibleRequestHandlers() {
	chrome.webRequest.onBeforeRequest.addListener(function(details) {
		if (details.tabId === -1) {
			return;
		}

		applyMatchingProxyRule(details.url);
		trackRequestStart(details);

		if (hasActiveRewriteRules()) {
			console.warn("Rewrite rules are temporarily disabled in the MV3 skeleton. DeclarativeNetRequest migration is still pending.");
		}
	}, {
		urls: ["<all_urls>"]
	});

	if (hasActiveHeaderOverrides()) {
		console.warn("Header overrides are temporarily disabled in the MV3 skeleton. DeclarativeNetRequest migration is still pending.");
	}
}

function withLegacyFallback(items) {
	var nextItems = cloneValue(items) || {};
	var legacyRewriteRules = readLegacyJson("rewrite_rules");
	var legacyProxyRules = readLegacyJson("proxy_rules");
	var legacyScriptsSettings = readLegacyJson("scripts_settings");
	var legacyConfig = readLegacyJson("config");

	if (isEmptyObject(nextItems.rewrite_rules) && !isEmptyObject(legacyRewriteRules)) {
		nextItems.rewrite_rules = legacyRewriteRules;
	}

	if (isEmptyObject(nextItems.proxy_rules) && !isEmptyObject(legacyProxyRules)) {
		nextItems.proxy_rules = legacyProxyRules;
	}

	if (isEmptyObject(nextItems.scripts_settings) && !isEmptyObject(legacyScriptsSettings)) {
		nextItems.scripts_settings = legacyScriptsSettings;
	}

	if (legacyConfig && typeof nextItems.config === "undefined") {
		nextItems.config = legacyConfig;
	}

	return nextItems;
}

function normalizeStoredState(items) {
	return {
		config: mergeConfig(items.config),
		rewrite_rules: ensureObject(items.rewrite_rules),
		proxy_rules: ensureObject(items.proxy_rules),
		scripts_settings: ensureObject(items.scripts_settings)
	};
}

function mergeConfig(storedConfig) {
	var mergedConfig = cloneValue(config);

	if (!storedConfig) {
		return mergedConfig;
	}

	if (storedConfig.ui) {
		mergedConfig.ui.start_profile = !!storedConfig.ui.start_profile;
	}

	if (storedConfig.app_settings) {
		if (storedConfig.app_settings.iframe_base_url) {
			mergedConfig.app_settings.iframe_base_url = storedConfig.app_settings.iframe_base_url;
		}
		if (typeof storedConfig.app_settings.max_profile_records !== "undefined") {
			mergedConfig.app_settings.max_profile_records = storedConfig.app_settings.max_profile_records;
		}
	}

	return mergedConfig;
}

function ensureObject(value) {
	return value && typeof value === "object" ? value : {};
}

function isEmptyObject(value) {
	return !value || Object.keys(value).length === 0;
}

function cloneValue(value) {
	if (typeof value === "undefined") {
		return undefined;
	}
	return JSON.parse(JSON.stringify(value));
}

function readLegacyJson(key) {
	if (typeof localStorage === "undefined" || typeof localStorage[key] === "undefined" || localStorage[key] === "") {
		return null;
	}

	try {
		return JSON.parse(localStorage[key]);
	} catch (error) {
		console.warn("Unable to migrate legacy setting", key, error);
		return null;
	}
}

function setProfilingState(enabled, callback) {
	state.config.ui.start_profile = enabled;

	if (enabled) {
		allRequests = {};
		lastRequestId = "";
	}

	chrome.storage.local.set({ config: state.config }, function() {
		callback({
			success: !chrome.runtime.lastError,
			startProfile: enabled
		});
	});
}

function trackRequestStart(details) {
	if (!state.config.ui.start_profile) {
		return;
	}

	lastRequestId = details.requestId;
	details.timeStampStart = details.timeStamp;
	allRequests[details.requestId] = details;
	trimProfileRecords();
}

function trimProfileRecords() {
	var maxRecords = state.config.app_settings.max_profile_records || 5000;
	var requestIds = Object.keys(allRequests);

	while (requestIds.length > maxRecords) {
		delete allRequests[requestIds.shift()];
	}
}

function applyMatchingProxyRule(url) {
	eachActiveRule(state.proxy_rules, function(rule) {
		if (matchesRule(rule, url)) {
			useProxy(rule.proxy_type, rule.proxy_location, rule.proxy_port);
		}
	});
}

function eachActiveRule(rules, callback) {
	Object.keys(ensureObject(rules)).forEach(function(key) {
		var rule = rules[key];
		if (rule && rule.active) {
			callback(rule);
		}
	});
}

function matchesRule(rule, url) {
	if (!rule || !rule.url) {
		return true;
	}

	var regex = buildRuleRegex(rule);
	return regex ? regex.test(url) : false;
}

function buildRuleRegex(rule) {
	try {
		var regExProperties = "";
		regExProperties += rule.global ? "g" : "";
		regExProperties += rule.caseinsensitive ? "i" : "";
		return new RegExp(rule.url || "", regExProperties);
	} catch (error) {
		console.warn("Invalid rule regex", rule && rule.url, error);
		return null;
	}
}

function hasActiveRewriteRules() {
	var hasRewriteRules = false;

	eachActiveRule(state.rewrite_rules, function(rule) {
		if (rule.replacement) {
			hasRewriteRules = true;
		}
	});

	return hasRewriteRules;
}

function hasActiveHeaderOverrides() {
	var hasOverrides = false;

	eachActiveRule(state.rewrite_rules, function(rule) {
		if (rule.request_header_override || rule.response_header_override) {
			hasOverrides = true;
		}
	});

	return hasOverrides;
}

function useProxy(proxy_type, proxy_location, proxy_port) {
	var proxyType = parseInt(proxy_type, 10);
	var port = parseInt(proxy_port, 10);
	var nextConfig = {
		mode: "",
		pacScript: {},
		rules: {}
	};

	switch (proxyType) {
		case 0:
			nextConfig.mode = "direct";
			break;

		case 1:
			nextConfig.mode = "system";
			nextConfig.rules.bypassList = [];
			break;

		case 2:
		case 3:
		case 4:
			nextConfig.mode = "pac_script";
			nextConfig.pacScript.url = proxy_location;
			break;

		case 5:
			nextConfig.mode = "fixed_servers";
			nextConfig.rules.singleProxy = {
				scheme: "http",
				host: proxy_location,
				port: isNaN(port) ? 80 : port
			};
			break;

		case 6:
			nextConfig.mode = "fixed_servers";
			nextConfig.rules.singleProxy = {
				scheme: "https",
				host: proxy_location,
				port: isNaN(port) ? 443 : port
			};
			break;

		default:
			return;
	}

	chrome.proxy.settings.set({
		value: nextConfig,
		scope: "regular"
	}, function() {});
}

function sendMessageToThePage(tabId, script_location, execute_type) {
	chrome.tabs.sendMessage(tabId, {
		from: "popup",
		subject: "ScriptURL",
		key: "script-rule",
		url: script_location,
		executeType: execute_type
	}, function() {
		if (chrome.runtime.lastError) {
			console.debug("Unable to inject into tab", tabId, chrome.runtime.lastError.message);
		}
	});
}
