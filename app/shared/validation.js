export function validateRewriteRule(rule) {
	const issues = [];

	pushRegexIssues(issues, rule.matchUrl, rule.regexFlags, "Match URL regex");
	pushHeaderIssues(issues, rule.requestHeaders, "Request headers");
	pushHeaderIssues(issues, rule.responseHeaders, "Response headers");

	if (rule.replacementUrl && rule.matchUrl) {
		const captureCount = countCaptureGroups(rule.matchUrl);
		const highestReference = highestBackReference(rule.replacementUrl);
		if (highestReference > captureCount) {
			issues.push("Replacement URL references capture group \\" + highestReference + " but the regex only defines " + captureCount + ".");
		}
	}

	if (rule.replacementUrl && !rule.matchUrl && !isLikelyUrl(rule.replacementUrl)) {
		issues.push("Replacement URL should be an absolute URL when Match URL regex is empty.");
	}

	return issues;
}

export function validateProxyRule(rule) {
	const issues = [];

	pushRegexIssues(issues, rule.matchUrl, rule.regexFlags, "Match URL regex");

	if ((rule.proxyMode === "http" || rule.proxyMode === "https") && !rule.proxyLocation) {
		issues.push("Proxy location is required for HTTP and HTTPS proxy modes.");
	}

	if (rule.proxyMode === "pac" && !isLikelyUrl(rule.proxyLocation)) {
		issues.push("PAC mode expects a valid URL in Proxy Location.");
	}

	if ((rule.proxyMode === "http" || rule.proxyMode === "https") && rule.proxyPort && !isValidPort(rule.proxyPort)) {
		issues.push("Proxy port must be a number between 1 and 65535.");
	}

	return issues;
}

export function validateScriptRule(rule, extensionBaseUrl) {
	const issues = [];

	pushRegexIssues(issues, rule.matchUrl, rule.regexFlags, "Match URL regex");

	if (!rule.source) {
		issues.push("Source is required.");
	}

	if (rule.assetType === "js" && rule.source && !String(rule.source).startsWith(extensionBaseUrl)) {
		issues.push("Bundled JS Asset must use an extension URL such as " + extensionBaseUrl + "app/injected/example.js");
	}

	if (rule.assetType === "css" && rule.source && !isLikelyUrl(rule.source) && !String(rule.source).startsWith(extensionBaseUrl)) {
		issues.push("CSS source should be an absolute URL or an extension asset URL.");
	}

	return issues;
}

export function summarizeValidation(state, extensionBaseUrl) {
	const rewriteIssues = flattenIssues(state.rewriteRules || [], validateRewriteRule);
	const proxyIssues = flattenIssues(state.proxyRules || [], validateProxyRule);
	const scriptIssues = flattenIssues(state.scriptRules || [], function(rule) {
		return validateScriptRule(rule, extensionBaseUrl);
	});

	return {
		rewriteIssues: rewriteIssues,
		proxyIssues: proxyIssues,
		scriptIssues: scriptIssues,
		totalIssues: rewriteIssues.length + proxyIssues.length + scriptIssues.length
	};
}

function flattenIssues(rules, validator) {
	return rules.map(function(rule) {
		return {
			id: rule.id,
			name: rule.name || "",
			issues: validator(rule)
		};
	}).filter(function(entry) {
		return entry.issues.length > 0;
	});
}

function pushRegexIssues(issues, pattern, flags, label) {
	if (!pattern) {
		return;
	}

	try {
		new RegExp(pattern, flags || "");
	} catch (error) {
		issues.push(label + " is not a valid regular expression.");
	}
}

function pushHeaderIssues(issues, rawHeaders, label) {
	const lines = String(rawHeaders || "").split("\n").filter(function(line) {
		return line.trim() !== "";
	});

	lines.forEach(function(line, index) {
		const separatorIndex = line.indexOf(":");
		if (separatorIndex === -1) {
			issues.push(label + " line " + (index + 1) + " must use name:value format.");
			return;
		}

		const name = line.slice(0, separatorIndex).trim();
		if (!name) {
			issues.push(label + " line " + (index + 1) + " is missing a header name.");
		}
	});
}

function countCaptureGroups(pattern) {
	let count = 0;
	let escaped = false;

	for (let index = 0; index < String(pattern).length; index += 1) {
		const char = pattern[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (char === "\\") {
			escaped = true;
			continue;
		}
		if (char === "(" && pattern[index + 1] !== "?") {
			count += 1;
		}
	}

	return count;
}

function highestBackReference(value) {
	const matches = String(value).match(/\\(\d+)/g) || [];
	return matches.reduce(function(highest, match) {
		return Math.max(highest, parseInt(match.slice(1), 10));
	}, 0);
}

function isLikelyUrl(value) {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "chrome-extension:";
	} catch (error) {
		return false;
	}
}

function isValidPort(value) {
	const parsed = parseInt(value, 10);
	return !Number.isNaN(parsed) && parsed >= 1 && parsed <= 65535;
}
