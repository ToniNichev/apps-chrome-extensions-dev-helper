import { CAPABILITIES, STORAGE_KEY, createDefaultState } from "../shared/schema.js";
import { syncDynamicRules } from "./dnr.js";
import { ensureState, getState, setState } from "../shared/storage.js";

let cachedState = createDefaultState();
let requestsById = {};
let lastRequestId = "";
let dnrStatus = {
	lastSyncedAt: null,
	ruleCount: 0,
	skippedRules: [],
	lastError: null
};
let capabilityWarnings = {
	scripts: false
};

bootstrap();

chrome.runtime.onInstalled.addListener(function() {
	bootstrap();
});

chrome.runtime.onStartup.addListener(function() {
	bootstrap();
});

chrome.storage.onChanged.addListener(function(changes, areaName) {
	if (areaName !== "local" || !changes[STORAGE_KEY]) {
		return;
	}

	cachedState = changes[STORAGE_KEY].newValue || createDefaultState();
	syncAndStoreDynamicRules(cachedState).catch(function(error) {
		console.error("Failed to sync dynamic rules after storage change", error);
	});
});

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
	handleMessage(message).then(function(response) {
		sendResponse(response);
	}).catch(function(error) {
		sendResponse({
			ok: false,
			error: error && error.message ? error.message : "Unknown background error"
		});
	});

	return true;
});

chrome.webRequest.onBeforeRequest.addListener(function(details) {
	if (details.tabId === -1) {
		return;
	}

	trackRequestStart(details);
	applyMatchingProxyRule(details.url);
}, {
	urls: ["<all_urls>"]
});

chrome.webRequest.onResponseStarted.addListener(function(details) {
	if (details.tabId === -1 || !cachedState.config.profilingEnabled) {
		return;
	}

	if (requestsById[details.requestId]) {
		requestsById[details.requestId].timeStampFirstByte = details.timeStamp;
	}
}, {
	urls: ["<all_urls>"]
}, ["responseHeaders"]);

chrome.webRequest.onCompleted.addListener(function(details) {
	if (details.tabId === -1 || !cachedState.config.profilingEnabled) {
		return;
	}

	if (!requestsById[details.requestId]) {
		return;
	}

	requestsById[details.requestId].timeStampEnd = details.timeStamp;
	requestsById[details.requestId].statusCode = details.statusCode;
	requestsById[details.requestId].blocking = details.requestId === lastRequestId ? "yes" : "no";
	delete requestsById[details.requestId].timeStamp;
}, {
	urls: ["<all_urls>"]
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
	if (changeInfo.status !== "complete" || tabId === -1) {
		return;
	}

	const rules = getActiveScriptRulesForUrl(tab && tab.url ? tab.url : "");
	if (!rules.length) {
		return;
	}

	chrome.tabs.sendMessage(tabId, {
		type: "INJECT_SCRIPT_RULES",
		rules: rules
	}, function() {
		if (chrome.runtime.lastError && !capabilityWarnings.scripts) {
			capabilityWarnings.scripts = true;
			console.warn("Script injection message could not be delivered to a tab.", chrome.runtime.lastError.message);
		}
	});
});

async function bootstrap() {
	cachedState = await ensureState();
	await syncAndStoreDynamicRules(cachedState);
}

async function handleMessage(message) {
	switch (message && message.type) {
		case "RUNTIME_GET_STATE":
			return {
				ok: true,
				data: buildRuntimeState()
			};

		case "RUNTIME_SET_PROFILING":
			return setProfilingEnabled(Boolean(message.enabled));

		case "RUNTIME_CLEAR_PROFILE":
			requestsById = {};
			lastRequestId = "";
			return {
				ok: true,
				data: buildRuntimeState()
			};

		default:
			return {
				ok: false,
				error: "Unsupported message type"
			};
	}
}

function buildRuntimeState() {
	return {
		state: cachedState,
		capabilities: CAPABILITIES,
		dnrStatus: dnrStatus,
		profile: {
			enabled: cachedState.config.profilingEnabled,
			requests: requestsById
		}
	};
}

async function syncAndStoreDynamicRules(state) {
	try {
		const compilation = await syncDynamicRules(state);
		dnrStatus = {
			lastSyncedAt: new Date().toISOString(),
			ruleCount: compilation.rules.length,
			skippedRules: compilation.skippedRules,
			lastError: null
		};
	} catch (error) {
		updateDnrStatusError(error);
		throw error;
	}
}

function updateDnrStatusError(error) {
	dnrStatus = {
		lastSyncedAt: dnrStatus.lastSyncedAt,
		ruleCount: dnrStatus.ruleCount,
		skippedRules: dnrStatus.skippedRules,
		lastError: error && error.message ? error.message : "Unknown DNR sync error"
	};
}

async function setProfilingEnabled(enabled) {
	const nextState = await getState();
	nextState.config.profilingEnabled = enabled;
	await setState(nextState);
	cachedState = nextState;

	if (enabled) {
		requestsById = {};
		lastRequestId = "";
	}

	return {
		ok: true,
		data: buildRuntimeState()
	};
}

function trackRequestStart(details) {
	if (!cachedState.config.profilingEnabled) {
		return;
	}

	lastRequestId = details.requestId;
	requestsById[details.requestId] = {
		requestId: details.requestId,
		url: details.url,
		method: details.method,
		type: details.type,
		tabId: details.tabId,
		timeStampStart: details.timeStamp
	};

	trimProfileRecords();
}

function trimProfileRecords() {
	const maxRecords = cachedState.config.maxProfileRecords || 5000;
	const keys = Object.keys(requestsById);

	while (keys.length > maxRecords) {
		delete requestsById[keys.shift()];
	}
}

function getActiveScriptRulesForUrl(url) {
	return cachedState.scriptRules.filter(function(rule) {
		return rule.active && matchesRule(rule.matchUrl, rule.regexFlags, url);
	});
}

function applyMatchingProxyRule(url) {
	cachedState.proxyRules.forEach(function(rule) {
		if (rule.active && matchesRule(rule.matchUrl, rule.regexFlags, url)) {
			useProxy(rule);
		}
	});
}

function useProxy(rule) {
	const port = parseInt(rule.proxyPort, 10);
	const config = {
		mode: "",
		pacScript: {},
		rules: {}
	};

	switch (rule.proxyMode) {
		case "direct":
			config.mode = "direct";
			break;
		case "system":
			config.mode = "system";
			config.rules.bypassList = [];
			break;
		case "pac":
			config.mode = "pac_script";
			config.pacScript.url = rule.proxyLocation;
			break;
		case "http":
			config.mode = "fixed_servers";
			config.rules.singleProxy = {
				scheme: "http",
				host: rule.proxyLocation,
				port: Number.isNaN(port) ? 80 : port
			};
			break;
		case "https":
			config.mode = "fixed_servers";
			config.rules.singleProxy = {
				scheme: "https",
				host: rule.proxyLocation,
				port: Number.isNaN(port) ? 443 : port
			};
			break;
		default:
			return;
	}

	chrome.proxy.settings.set({
		value: config,
		scope: "regular"
	});
}

function matchesRule(pattern, flags, value) {
	if (!pattern) {
		return true;
	}

	try {
		return new RegExp(pattern, flags || "").test(value);
	} catch (error) {
		console.warn("Invalid rule regex", pattern, error);
		return false;
	}
}
