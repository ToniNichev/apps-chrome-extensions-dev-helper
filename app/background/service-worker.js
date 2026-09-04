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
let compiledProxyMatchers = [];
let compiledScriptMatchers = [];
let compiledMockMatchers = [];
let appliedProxyRuleId = null;

const EXTERNAL_API_VERSION = 1;
const ALLOWED_EXTERNAL_ORIGINS = ["https://swissdev.tools"];
const THEME_STORAGE_KEY = "sdtTheme";
const ALLOWED_THEMES = ["dark", "terminal", "light", "nord", "gruvbox", "synthwave"];

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
	recompileMatchers(cachedState);
	syncAndStoreDynamicRules(cachedState).catch(function(error) {
		console.error("Failed to sync dynamic rules after storage change", error);
	});
	pushMockRulesToOpenTabs();
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

chrome.runtime.onMessageExternal.addListener(function(message, sender, sendResponse) {
	if (!isAllowedExternalSender(sender)) {
		sendResponse({ ok: false, error: "This site is not allowed to use the Dev Helper relay." });
		return false;
	}

	if (!message || !message.type) {
		sendResponse({ ok: false, error: "Missing message type." });
		return false;
	}

	if (message.type === "DEV_HELPER_PING") {
		sendResponse({ ok: true, version: EXTERNAL_API_VERSION });
		return false;
	}

	if (message.type === "DEV_HELPER_PROXY_FETCH") {
		handleProxyFetch(message).then(sendResponse).catch(function(error) {
			sendResponse({
				ok: false,
				error: error && error.message ? error.message : "Proxy fetch failed."
			});
		});
		return true;
	}

	if (message.type === "DEV_HELPER_THEME") {
		handleThemeSync(message).then(sendResponse).catch(function(error) {
			sendResponse({
				ok: false,
				error: error && error.message ? error.message : "Theme sync failed."
			});
		});
		return true;
	}

	sendResponse({ ok: false, error: "Unsupported message type." });
	return false;
});

/* Caches whichever theme swissdev.tools is currently showing, so the
   popup can match it on open — see app/popup/popup.js's applySyncedTheme().
   Stored under its own key, deliberately separate from STORAGE_KEY/
   normalizeState (the rule-schema state), since this isn't part of that
   schema and validating it through normalizeState would risk it being
   silently stripped by a future schema change. */
async function handleThemeSync(message) {
	const theme = ALLOWED_THEMES.indexOf(message.theme) !== -1 ? message.theme : "dark";
	await new Promise(function(resolve, reject) {
		chrome.storage.local.set({ [THEME_STORAGE_KEY]: theme }, function() {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError);
				return;
			}
			resolve();
		});
	});
	return { ok: true };
}

function isAllowedExternalSender(sender) {
	return Boolean(sender && ALLOWED_EXTERNAL_ORIGINS.indexOf(sender.origin) !== -1);
}

async function handleProxyFetch(message) {
	const url = String(message.url || "");
	if (!/^https?:\/\//i.test(url)) {
		return { ok: false, error: "URL must start with http:// or https://." };
	}

	const method = String(message.method || "GET").toUpperCase();
	const headers = message.headers && typeof message.headers === "object" ? message.headers : {};
	const body = (method === "GET" || method === "HEAD") ? undefined : message.body;

	const t0 = Date.now();
	const response = await fetch(url, {
		method: method,
		headers: headers,
		body: body || undefined
	});
	const text = await response.text();

	return {
		ok: true,
		status: response.status,
		statusText: response.statusText,
		headers: Array.from(response.headers.entries()),
		body: text,
		elapsedMs: Date.now() - t0
	};
}

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
	recompileMatchers(cachedState);
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

		case "RUNTIME_GET_MOCK_RULES":
			return {
				ok: true,
				data: getActiveMockRulesForUrl(message.url || "")
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
	return compiledScriptMatchers.filter(function(entry) {
		return entry.matches(url);
	}).map(function(entry) {
		return entry.rule;
	});
}

function applyMatchingProxyRule(url) {
	const match = compiledProxyMatchers.find(function(entry) {
		return entry.matches(url);
	});

	if (match) {
		if (appliedProxyRuleId !== match.rule.id) {
			appliedProxyRuleId = match.rule.id;
			useProxy(match.rule);
		}
		return;
	}

	if (appliedProxyRuleId !== null) {
		appliedProxyRuleId = null;
		chrome.proxy.settings.clear({ scope: "regular" });
	}
}

function recompileMatchers(state) {
	compiledProxyMatchers = compileMatchers(state.proxyRules);
	compiledScriptMatchers = compileMatchers(state.scriptRules);
	compiledMockMatchers = compileMatchers(state.mockRules);
}

function getActiveMockRulesForUrl(url) {
	return compiledMockMatchers.map(function(entry) {
		return entry.rule;
	});
}

function pushMockRulesToOpenTabs() {
	chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, function(tabs) {
		tabs.forEach(function(tab) {
			chrome.tabs.sendMessage(tab.id, {
				type: "SYNC_MOCK_RULES",
				rules: getActiveMockRulesForUrl(tab.url || "")
			}, function() {
				chrome.runtime.lastError;
			});
		});
	});
}

function compileMatchers(rules) {
	return (rules || []).filter(function(rule) {
		return rule.active;
	}).map(function(rule) {
		return {
			rule: rule,
			matches: compileMatcher(rule.matchUrl, rule.regexFlags)
		};
	});
}

function compileMatcher(pattern, flags) {
	if (!pattern) {
		return function() {
			return true;
		};
	}

	let regex;
	try {
		regex = new RegExp(pattern, flags || "");
	} catch (error) {
		console.warn("Invalid rule regex", pattern, error);
		return function() {
			return false;
		};
	}

	return function(value) {
		return regex.test(value);
	};
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
