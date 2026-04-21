const RESOURCE_TYPES = [
	"main_frame",
	"sub_frame",
	"stylesheet",
	"script",
	"image",
	"font",
	"object",
	"xmlhttprequest",
	"ping",
	"csp_report",
	"media",
	"websocket",
	"webtransport",
	"webbundle",
	"other"
];

const RULE_NAMESPACE = 4_000_000;
const RULE_STRIDE = 10;

export async function syncDynamicRules(state) {
	const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
	const compilation = buildDynamicRules(state);

	await chrome.declarativeNetRequest.updateDynamicRules({
		removeRuleIds: existingRules.map(function(rule) {
			return rule.id;
		}),
		addRules: compilation.rules
	});

	return compilation;
}

function buildDynamicRules(state) {
	const rules = [];
	const skippedRules = [];

	(state.rewriteRules || []).forEach(function(rule, index) {
		if (!rule || !rule.active) {
			return;
		}

		const baseId = RULE_NAMESPACE + (index * RULE_STRIDE);
		const condition = buildCondition(rule, skippedRules);
		if (!condition) {
			skippedRules.push({
				ruleId: rule.id,
				reason: "Match URL regex is invalid."
			});
			return;
		}

		if (rule.replacementUrl) {
			const redirect = buildRedirectAction(rule);
			if (!redirect) {
				skippedRules.push({
					ruleId: rule.id,
					reason: "Replacement URL is not valid for this rewrite rule."
				});
			} else {
				rules.push({
					id: baseId + 1,
					priority: 1,
					action: {
						type: "redirect",
						redirect: redirect
					},
					condition: condition
				});
			}
		}

		const requestHeaders = parseHeaderOverrides(rule.requestHeaders);
		if (requestHeaders.length) {
			rules.push({
				id: baseId + 2,
				priority: 1,
				action: {
					type: "modifyHeaders",
					requestHeaders: requestHeaders
				},
				condition: condition
			});
		}

		const responseHeaders = parseHeaderOverrides(rule.responseHeaders);
		if (responseHeaders.length) {
			rules.push({
				id: baseId + 3,
				priority: 1,
				action: {
					type: "modifyHeaders",
					responseHeaders: responseHeaders
				},
				condition: condition
			});
		}
	});

	return {
		rules: rules,
		skippedRules: skippedRules
	};
}

function buildCondition(rule) {
	const condition = {
		resourceTypes: RESOURCE_TYPES
	};

	if (rule.matchUrl) {
		if (!isValidRegex(rule.matchUrl, rule.regexFlags)) {
			return null;
		}
		condition.regexFilter = rule.matchUrl;
		condition.isUrlFilterCaseSensitive = !String(rule.regexFlags || "").includes("i");
	}

	return condition;
}

function buildRedirectAction(rule) {
	if (rule.matchUrl) {
		return {
			regexSubstitution: rule.replacementUrl
		};
	}

	if (!isLikelyUrl(rule.replacementUrl)) {
		return null;
	}

	return {
		url: rule.replacementUrl
	};
}

function parseHeaderOverrides(rawValue) {
	return String(rawValue || "").split("\n").map(function(line) {
		const separatorIndex = line.indexOf(":");
		if (separatorIndex === -1) {
			return null;
		}

		const header = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();

		if (!header) {
			return null;
		}

		return {
			header: header.toLowerCase(),
			operation: "set",
			value: value
		};
	}).filter(function(item) {
		return item !== null;
	});
}

function isValidRegex(pattern, flags) {
	try {
		new RegExp(pattern, flags || "");
		return true;
	} catch (error) {
		return false;
	}
}

function isLikelyUrl(value) {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch (error) {
		return false;
	}
}
