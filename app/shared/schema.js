export const STORAGE_KEY = "devHelperState";
export const APP_VERSION = 1;

export const CAPABILITIES = {
	rewriteRules: "supported",
	headerOverrides: "supported",
	proxyRules: "supported",
	scriptInjection: "partial",
	profiling: "supported"
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
		scriptRules: []
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
		scriptRules: normalizeRuleArray(value.scriptRules, normalizeScriptRule)
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

function normalizeProxyRule(rule) {
	const source = rule && typeof rule === "object" ? rule : {};

	return {
		id: source.id || createId("proxy"),
		name: source.name || "",
		active: Boolean(source.active),
		matchUrl: source.matchUrl || "",
		regexFlags: normalizeRegexFlags(source.regexFlags || ""),
		proxyMode: source.proxyMode || "direct",
		proxyLocation: source.proxyLocation || "",
		proxyPort: source.proxyPort || ""
	};
}

function normalizeScriptRule(rule) {
	const source = rule && typeof rule === "object" ? rule : {};

	return {
		id: source.id || createId("script"),
		name: source.name || "",
		active: Boolean(source.active),
		matchUrl: source.matchUrl || "",
		regexFlags: normalizeRegexFlags(source.regexFlags || ""),
		assetType: source.assetType || "css",
		source: source.source || "",
		injectInto: source.injectInto === "body" ? "body" : "head"
	};
}

function normalizeRegexFlags(flags) {
	const uniqueFlags = Array.from(new Set(String(flags).split("").filter(function(flag) {
		return flag === "g" || flag === "i";
	})));

	return uniqueFlags.join("");
}
