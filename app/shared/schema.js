export const STORAGE_KEY = "devHelperState";
export const APP_VERSION = 1;

export const CAPABILITIES = {
	rewriteRules: "supported",
	headerOverrides: "supported",
	proxyRules: "supported",
	scriptInjection: "supported",
	profiling: "supported",
	watchdog: "supported"
};

export function createDefaultState() {
	return {
		version: APP_VERSION,
		ui: {
			activeTab: "profiling"
		},
		config: {
			profilingEnabled: false,
			iframeBaseUrl: "http://chrome-dev-helper.toni-develops.com/",
			maxProfileRecords: 5000
		},
		rewriteRules: [],
		proxyRules: [],
		scriptRules: [],
		mockRules: [],
		watchdogRules: []
	};
}

export function normalizeState(candidate) {
	const defaults = createDefaultState();
	const value = candidate && typeof candidate === "object" ? candidate : {};

	return {
		version: APP_VERSION,
		ui: {
			activeTab: value.ui && value.ui.activeTab ? value.ui.activeTab : defaults.ui.activeTab
		},
		config: {
			profilingEnabled: Boolean(value.config && value.config.profilingEnabled),
			iframeBaseUrl: value.config && value.config.iframeBaseUrl ? value.config.iframeBaseUrl : defaults.config.iframeBaseUrl,
			maxProfileRecords: value.config && Number.isFinite(value.config.maxProfileRecords) ? value.config.maxProfileRecords : defaults.config.maxProfileRecords
		},
		rewriteRules: normalizeRuleArray(value.rewriteRules, normalizeRewriteRule),
		proxyRules: normalizeRuleArray(value.proxyRules, normalizeProxyRule),
		scriptRules: normalizeRuleArray(value.scriptRules, normalizeScriptRule),
		mockRules: normalizeRuleArray(value.mockRules, normalizeMockRule),
		watchdogRules: normalizeRuleArray(value.watchdogRules, normalizeWatchdogRule)
	};
}

export function createId(prefix) {
	return [prefix, Date.now(), Math.random().toString(36).slice(2, 8)].join("_");
}

function normalizeRuleArray(value, itemNormalizer) {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.map(itemNormalizer);
}

function normalizeRewriteRule(rule) {
	const source = rule && typeof rule === "object" ? rule : {};

	return {
		id: source.id || createId("rewrite"),
		name: source.name || "",
		active: Boolean(source.active),
		matchUrl: source.matchUrl || "",
		replacementUrl: source.replacementUrl || "",
		requestHeaders: source.requestHeaders || "",
		responseHeaders: source.responseHeaders || "",
		regexFlags: normalizeRegexFlags(source.regexFlags || "")
	};
}

/* proxyMode used to be direct/system/pac/http/https, applied reactively via
   chrome.proxy.settings.set()/.clear() as each request's onBeforeRequest
   fired — which could only ever flip one global, browser-wide setting on
   or off, not actually route just the matching URL through a proxy (see
   the commit that replaced this: it's now compiled into a single PAC
   script instead, evaluated by Chrome per-connection). "direct" and
   "system" have no PAC equivalent and "pac" (point at an external PAC
   entirely) is superseded by this file generating its own, so the only
   two proxyScheme values now are how to reach the upstream proxy itself:
   plain HTTP or a secure (HTTPS) connection to it. A rule stored under
   the old field name/values normalizes to "http" here. */
function normalizeProxyRule(rule) {
	const source = rule && typeof rule === "object" ? rule : {};

	return {
		id: source.id || createId("proxy"),
		name: source.name || "",
		active: Boolean(source.active),
		matchUrl: source.matchUrl || "",
		regexFlags: normalizeRegexFlags(source.regexFlags || ""),
		proxyScheme: source.proxyScheme === "https" ? "https" : "http",
		proxyLocation: source.proxyLocation || "",
		proxyPort: source.proxyPort || ""
	};
}

/* JS-asset injection (assetType: "js") was dropped — MV3 required any such
   script to be pre-bundled as an extension asset before a rule could
   reference it, which meant it could never be a "paste a URL, done" rule
   like the rest; DevTools' own Snippets cover ad-hoc JS better anyway. A
   pre-existing stored rule with assetType "js" is silently treated as CSS
   from here on (its source, if not a real stylesheet, just won't apply). */
function normalizeScriptRule(rule) {
	const source = rule && typeof rule === "object" ? rule : {};

	return {
		id: source.id || createId("script"),
		name: source.name || "",
		active: Boolean(source.active),
		matchUrl: source.matchUrl || "",
		regexFlags: normalizeRegexFlags(source.regexFlags || ""),
		source: source.source || "",
		injectInto: source.injectInto === "body" ? "body" : "head"
	};
}

function normalizeMockRule(rule) {
	const source = rule && typeof rule === "object" ? rule : {};

	return {
		id: source.id || createId("mock"),
		name: source.name || "",
		active: Boolean(source.active),
		matchUrl: source.matchUrl || "",
		regexFlags: normalizeRegexFlags(source.regexFlags || ""),
		method: source.method || "ANY",
		status: source.status || "200",
		responseHeaders: source.responseHeaders || "",
		responseBody: source.responseBody || ""
	};
}

function normalizeWatchdogRule(rule) {
	const source = rule && typeof rule === "object" ? rule : {};

	return {
		id: source.id || createId("watchdog"),
		name: source.name || "",
		active: Boolean(source.active),
		matchUrl: source.matchUrl || "",
		regexFlags: normalizeRegexFlags(source.regexFlags || ""),
		method: source.method || "ANY",
		status: source.status || "ANY"
	};
}

function normalizeRegexFlags(flags) {
	const uniqueFlags = Array.from(new Set(String(flags).split("").filter(function(flag) {
		return flag === "g" || flag === "i";
	})));

	return uniqueFlags.join("");
}
