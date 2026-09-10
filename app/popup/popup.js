import { createDefaultState, createId } from "../shared/schema.js";
import { getState, setState } from "../shared/storage.js";
import { isValidRegex, isValidStatusFilter, summarizeValidation, validateMockRule, validateProxyRule, validateRewriteRule, validateScriptRule, validateWatchdogRule } from "../shared/validation.js";

const extensionBaseUrl = chrome.runtime.getURL("");
const THEME_STORAGE_KEY = "sdtTheme";
let appState = createDefaultState();
let runtimeState = null;

initialize().catch(function(error) {
	console.error("Failed to initialize popup", error);
});

async function initialize() {
	await applySyncedTheme();
	appState = await getState();
	await refreshRuntimeState();
	wireGlobalEvents();
	render();
	window.setInterval(refreshRuntimeStateAndRender, 1000);
}

/* Mirrors whichever theme swissdev.tools is currently showing — pushed
   here by assets/dev-helper-relay.js's MutationObserver on the site's own
   <html data-theme> attribute, via the DEV_HELPER_THEME message the
   background service worker caches under THEME_STORAGE_KEY (see
   handleThemeSync() in app/background/service-worker.js). Falls back to
   the default dark theme if swissdev.tools has never been visited with
   this extension installed (nothing cached yet). Also live-updates while
   the popup is open, in case the theme changes on the site mid-session. */
function applyTheme(theme) {
	var root = document.documentElement;
	if (theme && theme !== "dark") {
		root.setAttribute("data-theme", theme);
	} else {
		root.removeAttribute("data-theme");
	}
}

function applySyncedTheme() {
	return new Promise(function(resolve) {
		chrome.storage.local.get(THEME_STORAGE_KEY, function(result) {
			applyTheme(result && result[THEME_STORAGE_KEY]);
			resolve();
		});
	});
}

chrome.storage.onChanged.addListener(function(changes, areaName) {
	if (areaName === "local" && changes[THEME_STORAGE_KEY]) {
		applyTheme(changes[THEME_STORAGE_KEY].newValue);
	}
});

function wireGlobalEvents() {
	document.getElementById("tabStrip").addEventListener("click", handleTabClick);
	document.getElementById("toggleProfilingButton").addEventListener("click", handleProfilingToggle);
	document.getElementById("clearProfileButton").addEventListener("click", handleProfileClear);
	document.getElementById("domainChart").addEventListener("mousemove", handleDomainChartHover);
	document.getElementById("domainChart").addEventListener("mouseleave", hideHoverPanel);
	document.getElementById("addRewriteRuleButton").addEventListener("click", function() {
		appState.rewriteRules.push(createRewriteRule());
		saveAndRender();
	});
	document.getElementById("addProxyRuleButton").addEventListener("click", function() {
		appState.proxyRules.push(createProxyRule());
		saveAndRender();
	});
	document.getElementById("addScriptRuleButton").addEventListener("click", function() {
		appState.scriptRules.push(createScriptRule());
		saveAndRender();
	});
	document.getElementById("addMockRuleButton").addEventListener("click", function() {
		appState.mockRules.push(createMockRule());
		saveAndRender();
	});
	document.getElementById("addWatchdogRuleButton").addEventListener("click", function() {
		appState.watchdogRules.push(createWatchdogRule());
		saveAndRender();
	});
	document.getElementById("clearWatchdogMatchesButton").addEventListener("click", handleWatchdogMatchesClear);
}

function handleTabClick(event) {
	const button = event.target.closest("[data-tab]");
	if (!button) {
		return;
	}

	appState.ui.activeTab = button.dataset.tab;
	saveAndRender();
}

async function handleProfilingToggle() {
	const enabled = !(runtimeState && runtimeState.profile && runtimeState.profile.enabled);
	await sendRuntimeMessage({
		type: "RUNTIME_SET_PROFILING",
		enabled: enabled
	});
	await refreshRuntimeState();
	renderProfiling();
	renderRuntimeHealth();
}

async function handleProfileClear() {
	await sendRuntimeMessage({ type: "RUNTIME_CLEAR_PROFILE" });
	await refreshRuntimeState();
	renderProfiling();
}

async function handleWatchdogMatchesClear() {
	await sendRuntimeMessage({ type: "RUNTIME_CLEAR_WATCHDOG_MATCHES" });
	await refreshRuntimeState();
	renderWatchdogMatches();
}

function render() {
	renderTabs();
	renderProfiling();
	renderRuntimeHealth();
	renderValidationSummary();
	renderRewriteRules();
	renderProxyRules();
	renderScriptRules();
	renderMockRules();
	renderWatchdogRules();
	renderWatchdogMatches();
}

function renderTabs() {
	document.querySelectorAll(".tab-button").forEach(function(button) {
		button.classList.toggle("is-active", button.dataset.tab === appState.ui.activeTab);
	});

	document.querySelectorAll(".panel").forEach(function(panel) {
		panel.classList.toggle("is-active", panel.dataset.panel === appState.ui.activeTab);
	});
}

function renderProfiling() {
	const profile = runtimeState && runtimeState.profile ? runtimeState.profile : { enabled: false, requests: {} };
	const requestList = Object.values(profile.requests || {}).sort(function(a, b) {
		return (b.timeStampStart || 0) - (a.timeStampStart || 0);
	});
	const toggleButton = document.getElementById("toggleProfilingButton");
	const profilingPanel = document.getElementById("profilingPanel");
	toggleButton.textContent = profile.enabled ? "Stop Profiling" : "Start Profiling";
	toggleButton.classList.toggle("is-recording", profile.enabled);
	profilingPanel.classList.toggle("is-recording", profile.enabled);

	renderDomainChart(requestList);
}

function renderWatchdogMatches() {
	const watchdog = runtimeState && runtimeState.watchdog ? runtimeState.watchdog : { matches: [] };
	const emptyState = document.getElementById("watchdogMatchEmpty");
	const list = document.getElementById("watchdogMatchList");

	if (!watchdog.matches.length) {
		emptyState.classList.remove("is-hidden");
		list.innerHTML = "";
		return;
	}

	emptyState.classList.add("is-hidden");
	list.innerHTML = watchdog.matches.map(function(match) {
		const time = match.timeStamp ? new Date(match.timeStamp).toLocaleTimeString() : "";
		return [
			'<div class="watchdog-match-row">',
			'<span class="watchdog-match-time">' + escapeHtml(time) + "</span>",
			'<span class="watchdog-match-rule">' + escapeHtml(match.ruleName) + "</span>",
			'<span class="watchdog-match-detail">' + escapeHtml(match.method || "") + " " + escapeHtml(String(match.statusCode || "")) + "</span>",
			'<span class="watchdog-match-url" title="' + escapeHtml(match.url || "") + '">' + escapeHtml(match.url || "") + "</span>",
			"</div>"
		].join("");
	}).join("");
}

function renderRuntimeHealth() {
	const target = document.getElementById("runtimeHealth");
	const dnrStatus = runtimeState && runtimeState.dnrStatus ? runtimeState.dnrStatus : null;
	const proxyStatus = runtimeState && runtimeState.proxyStatus ? runtimeState.proxyStatus : null;

	if (!dnrStatus) {
		target.innerHTML = '<div class="status-list"><div class="status-pill is-error">Runtime state is unavailable.</div></div>';
		return;
	}

	const pills = [
		"Dynamic rules: " + dnrStatus.ruleCount,
		"Last sync: " + (dnrStatus.lastSyncedAt ? new Date(dnrStatus.lastSyncedAt).toLocaleTimeString() : "Not yet"),
		"Skipped rules: " + dnrStatus.skippedRules.length,
		"Proxy: " + (proxyStatus && proxyStatus.active ? proxyStatus.ruleCount + " active rule(s) via PAC" : "off")
	];

	const lastErrorText = dnrStatus.lastError || (proxyStatus && proxyStatus.lastError ? "Proxy PAC: " + proxyStatus.lastError : null);
	if (lastErrorText) {
		pills.push("Last error: " + lastErrorText);
	}

	target.innerHTML = '<div class="status-list">' + pills.map(function(text, index) {
		const isError = index === pills.length - 1 && lastErrorText;
		return '<div class="status-pill ' + (isError ? "is-error" : "") + '">' + escapeHtml(text) + "</div>";
	}).join("") + renderSkippedRules(dnrStatus.skippedRules) + "</div>";
}

function renderValidationSummary() {
	const validation = summarizeValidation(appState, extensionBaseUrl);
	const target = document.getElementById("validationSummary");

	if (!validation.totalIssues) {
		target.innerHTML = '<div class="status-list"><div class="status-pill">No validation issues detected.</div></div>';
		return;
	}

	const items = [];
	appendIssueItems(items, "Rewrite", validation.rewriteIssues);
	appendIssueItems(items, "Proxy", validation.proxyIssues);
	appendIssueItems(items, "Script", validation.scriptIssues);
	appendIssueItems(items, "Mock", validation.mockIssues);
	appendIssueItems(items, "Watchdog", validation.watchdogIssues);

	target.innerHTML = '<div class="issue-list">' + items.map(function(item) {
		return '<div class="issue-pill is-warning">' + escapeHtml(item) + "</div>";
	}).join("") + "</div>";
}

function renderDomainChart(requestList) {
	const chart = document.getElementById("domainChart");
	const list = document.getElementById("domainList");
	const emptyState = document.getElementById("domainEmpty");
	const grouped = groupRequestsByDomain(requestList);

	if (!grouped.length) {
		chart.innerHTML = "";
		list.innerHTML = "";
		emptyState.classList.remove("is-hidden");
		return;
	}

	emptyState.classList.add("is-hidden");

	const topDomains = grouped.slice(0, 5);
	const otherDomains = grouped.slice(5);
	if (otherDomains.length) {
		topDomains.push({
			domain: "Other",
			duration: otherDomains.reduce(function(total, item) {
				return total + item.duration;
			}, 0),
			requestCount: otherDomains.reduce(function(total, item) {
				return total + item.requestCount;
			}, 0)
		});
	}

	const totalDuration = topDomains.reduce(function(total, item) {
		return total + item.duration;
	}, 0);

	let startAngle = -Math.PI / 2;
	const radius = 74;
	const innerRadius = 40;
	const center = 110;

	chart.innerHTML = topDomains.map(function(item, index) {
		const color = domainColor(index);
		const sliceAngle = (item.duration / totalDuration) * Math.PI * 2;
		const endAngle = startAngle + sliceAngle;
		const path = donutSlicePath(center, center, radius, innerRadius, startAngle, endAngle);
		const tooltip = item.domain + " | " + Math.round(item.duration) + "ms cumulative | " + item.requestCount + " requests";
		const share = totalDuration ? Math.round((item.duration / totalDuration) * 100) : 0;
		startAngle = endAngle;
		return '<path data-domain="' + escapeHtml(item.domain) + '" data-duration="' + escapeHtml(String(Math.round(item.duration))) + '" data-requests="' + escapeHtml(String(item.requestCount)) + '" data-share="' + escapeHtml(String(share)) + '" d="' + path + '" fill="' + color + '"><title>' + escapeHtml(tooltip) + '</title></path>';
	}).join("") +
		'<circle cx="' + center + '" cy="' + center + '" r="' + innerRadius + '" fill="#252535"></circle>' +
		'<text x="' + center + '" y="' + (center - 4) + '" text-anchor="middle" font-size="12" fill="#a6adc8">Domains</text>' +
		'<text x="' + center + '" y="' + (center + 16) + '" text-anchor="middle" font-size="18" font-weight="700" fill="#cdd6f4">' + escapeHtml(String(topDomains.length)) + "</text>";

	list.innerHTML = topDomains.map(function(item, index) {
		const color = domainColor(index);
		const share = Math.round((item.duration / totalDuration) * 100);
		return [
			'<div class="domain-row">',
			'<span class="domain-dot" style="background:' + escapeHtml(color) + '"></span>',
			'<div><div class="domain-name">' + escapeHtml(item.domain) + '</div><div class="hint">' + escapeHtml(String(item.requestCount)) + ' requests</div></div>',
			'<div class="domain-meta">' + escapeHtml(String(Math.round(item.duration))) + "ms<br>" + escapeHtml(String(share)) + "%</div>",
			"</div>"
		].join("");
	}).join("");
}

function renderRewriteRules() {
	renderRuleSection({
		emptyId: "rewriteEmptyState",
		containerId: "rewriteRuleList",
		rules: appState.rewriteRules,
		renderRule: renderRewriteRule
	});
}

function renderProxyRules() {
	renderRuleSection({
		emptyId: "proxyEmptyState",
		containerId: "proxyRuleList",
		rules: appState.proxyRules,
		renderRule: renderProxyRule
	});
}

function renderScriptRules() {
	renderRuleSection({
		emptyId: "scriptEmptyState",
		containerId: "scriptRuleList",
		rules: appState.scriptRules,
		renderRule: renderScriptRule
	});
}

function renderMockRules() {
	renderRuleSection({
		emptyId: "mockEmptyState",
		containerId: "mockRuleList",
		rules: appState.mockRules,
		renderRule: renderMockRule
	});
}

function renderWatchdogRules() {
	renderRuleSection({
		emptyId: "watchdogEmptyState",
		containerId: "watchdogRuleList",
		rules: appState.watchdogRules,
		renderRule: renderWatchdogRule
	});
}

function renderRuleSection(config) {
	const emptyState = document.getElementById(config.emptyId);
	const container = document.getElementById(config.containerId);
	emptyState.classList.toggle("is-hidden", config.rules.length > 0);
	container.innerHTML = config.rules.map(config.renderRule).join("");

	container.querySelectorAll("[data-action='remove']").forEach(function(button) {
		button.addEventListener("click", handleRemoveRule);
	});

	container.querySelectorAll("[data-field]").forEach(function(field) {
		field.addEventListener("input", handleRuleFieldInput);
		field.addEventListener("change", handleRuleFieldInput);
	});
}

function renderRewriteRule(rule) {
	const issues = validateRewriteRule(rule);

	return [
		'<article class="rule-card" data-rule-type="rewrite" data-rule-id="' + escapeHtml(rule.id) + '">',
		renderRuleHead(rule),
		'<div class="rule-grid">',
		renderTextField("Name", "name", rule.name),
		renderRegexFlagsField(rule.regexFlags),
		renderTextField("Match URL Regex", "matchUrl", rule.matchUrl, "full-span", !isValidRegex(rule.matchUrl, rule.regexFlags)),
		renderTextField("Replacement URL", "replacementUrl", rule.replacementUrl, "full-span"),
		renderTextareaField("Request Headers", "requestHeaders", rule.requestHeaders),
		renderTextareaField("Response Headers", "responseHeaders", rule.responseHeaders),
		'<p class="hint full-span">These rules compile into MV3 dynamic DNR rules. Use regex capture groups in the match pattern if you want redirect substitutions in the replacement URL.</p>',
		renderRuleIssues(issues),
		"</div>",
		"</article>"
	].join("");
}

function renderProxyRule(rule) {
	const issues = validateProxyRule(rule);

	return [
		'<article class="rule-card" data-rule-type="proxy" data-rule-id="' + escapeHtml(rule.id) + '">',
		renderRuleHead(rule),
		'<div class="rule-grid">',
		renderTextField("Name", "name", rule.name),
		renderRegexFlagsField(rule.regexFlags),
		renderTextField("Match URL Regex", "matchUrl", rule.matchUrl, "full-span", !isValidRegex(rule.matchUrl, rule.regexFlags)),
		renderSelectField("Reach Proxy Via", "proxyScheme", rule.proxyScheme, [
			["http", "Plain HTTP"],
			["https", "Secure (HTTPS)"]
		]),
		renderTextField("Proxy Host", "proxyLocation", rule.proxyLocation),
		renderTextField("Proxy Port", "proxyPort", rule.proxyPort),
		'<p class="hint full-span">Compiled into one PAC script covering every active Proxy rule, evaluated by Chrome per-connection — only requests matching this rule\'s pattern go through this proxy; everything else goes direct. An empty Match URL Regex matches every request. If multiple active rules could match the same URL, the first one (in the order shown here) wins.</p>',
		renderRuleIssues(issues),
		"</div>",
		"</article>"
	].join("");
}

function renderScriptRule(rule) {
	const issues = validateScriptRule(rule, extensionBaseUrl);

	return [
		'<article class="rule-card" data-rule-type="script" data-rule-id="' + escapeHtml(rule.id) + '">',
		renderRuleHead(rule),
		'<div class="rule-grid">',
		renderTextField("Name", "name", rule.name),
		renderRegexFlagsField(rule.regexFlags),
		renderTextField("Match URL Regex", "matchUrl", rule.matchUrl, "full-span", !isValidRegex(rule.matchUrl, rule.regexFlags)),
		renderSelectField("Inject Into", "injectInto", rule.injectInto, [
			["head", "Head"],
			["body", "Body"]
		]),
		renderTextField("CSS URL", "source", rule.source, "full-span"),
		'<p class="hint full-span">An absolute URL, or a bundled extension asset URL like <code>' + escapeHtml(chrome.runtime.getURL("app/injected/")) + "your-file.css</code>.</p>",
		renderRuleIssues(issues),
		"</div>",
		"</article>"
	].join("");
}

function renderMockRule(rule) {
	const issues = validateMockRule(rule);

	return [
		'<article class="rule-card" data-rule-type="mock" data-rule-id="' + escapeHtml(rule.id) + '">',
		renderRuleHead(rule),
		'<div class="rule-grid">',
		renderTextField("Name", "name", rule.name),
		renderRegexFlagsField(rule.regexFlags),
		renderTextField("Match URL Regex", "matchUrl", rule.matchUrl, "full-span", !isValidRegex(rule.matchUrl, rule.regexFlags)),
		renderSelectField("Method", "method", rule.method, [
			["ANY", "Any"],
			["GET", "GET"],
			["POST", "POST"],
			["PUT", "PUT"],
			["PATCH", "PATCH"],
			["DELETE", "DELETE"]
		]),
		renderTextField("Status Code", "status", rule.status),
		renderTextareaField("Response Headers", "responseHeaders", rule.responseHeaders),
		renderTextareaField("Response Body", "responseBody", rule.responseBody),
		'<p class="hint full-span">Set a <code>content-type</code> line in Response Headers (e.g. <code>content-type: application/json</code>) to control how the body is interpreted. Mocking intercepts the page’s own <code>fetch()</code> calls directly; it does not use declarativeNetRequest.</p>',
		renderRuleIssues(issues),
		"</div>",
		"</article>"
	].join("");
}

function renderWatchdogRule(rule) {
	const issues = validateWatchdogRule(rule);

	return [
		'<article class="rule-card" data-rule-type="watchdog" data-rule-id="' + escapeHtml(rule.id) + '">',
		renderRuleHead(rule),
		'<div class="rule-grid">',
		renderTextField("Name", "name", rule.name),
		renderRegexFlagsField(rule.regexFlags),
		renderTextField("Match URL Regex", "matchUrl", rule.matchUrl, "full-span", !isValidRegex(rule.matchUrl, rule.regexFlags)),
		renderSelectField("Method", "method", rule.method, [
			["ANY", "Any"],
			["GET", "GET"],
			["POST", "POST"],
			["PUT", "PUT"],
			["PATCH", "PATCH"],
			["DELETE", "DELETE"]
		]),
		renderTextField("Status Filter", "status", rule.status, "", !isValidStatusFilter(rule.status)),
		'<p class="hint full-span">Status Filter accepts <code>ANY</code>, an exact code like <code>404</code>, or a class like <code>4xx</code>/<code>5xx</code>. A match fires a desktop notification (throttled to once per 5s per rule) and a toolbar badge count, whether or not Profiling is turned on.</p>',
		renderRuleIssues(issues),
		"</div>",
		"</article>"
	].join("");
}

function renderRuleHead(rule) {
	return [
		'<div class="rule-head">',
		'<div class="rule-title"><label class="switch"><input type="checkbox" data-field="active" ' + (rule.active ? "checked" : "") + "> Active</label></div>",
		'<button type="button" class="danger-button" data-action="remove">Remove</button>',
		"</div>"
	].join("");
}

function renderTextField(label, field, value, className, isInvalid) {
	return [
		'<div class="field ' + (className || "") + '">',
		"<label>" + escapeHtml(label) + "</label>",
		'<input type="text" data-field="' + escapeHtml(field) + '" class="' + (isInvalid ? "is-invalid" : "") + '" value="' + escapeHtml(value || "") + '">',
		"</div>"
	].join("");
}

function renderTextareaField(label, field, value) {
	return [
		'<div class="field">',
		"<label>" + escapeHtml(label) + "</label>",
		'<textarea data-field="' + escapeHtml(field) + '">' + escapeHtml(value || "") + "</textarea>",
		"</div>"
	].join("");
}

function renderSelectField(label, field, selectedValue, options) {
	return [
		'<div class="field">',
		"<label>" + escapeHtml(label) + "</label>",
		'<select data-field="' + escapeHtml(field) + '">',
		options.map(function(option) {
			return '<option value="' + escapeHtml(option[0]) + '" ' + (option[0] === selectedValue ? "selected" : "") + ">" + escapeHtml(option[1]) + "</option>";
		}).join(""),
		"</select>",
		"</div>"
	].join("");
}

function renderRegexFlagsField(value) {
	return renderTextField("Regex Flags", "regexFlags", value, "");
}

function renderRuleIssues(issues) {
	if (!issues.length) {
		return "";
	}

	return '<div class="full-span issue-list">' + issues.map(function(issue) {
		return '<div class="issue-pill">' + escapeHtml(issue) + "</div>";
	}).join("") + "</div>";
}

function renderSkippedRules(skippedRules) {
	if (!skippedRules || !skippedRules.length) {
		return "";
	}

	return skippedRules.map(function(entry) {
		return '<div class="issue-pill">' + escapeHtml((entry.ruleId || "rule") + ": " + entry.reason) + "</div>";
	}).join("");
}

function handleRemoveRule(event) {
	const card = event.target.closest("[data-rule-id]");
	if (!card) {
		return;
	}

	const collection = getRuleCollection(card.dataset.ruleType);
	const nextCollection = collection.filter(function(rule) {
		return rule.id !== card.dataset.ruleId;
	});

	assignRuleCollection(card.dataset.ruleType, nextCollection);
	saveAndRender();
}

function handleRuleFieldInput(event) {
	const card = event.target.closest("[data-rule-id]");
	if (!card) {
		return;
	}

	const ruleType = card.dataset.ruleType;
	const collection = getRuleCollection(ruleType);
	const targetRule = collection.find(function(rule) {
		return rule.id === card.dataset.ruleId;
	});

	if (!targetRule) {
		return;
	}

	const fieldName = event.target.dataset.field;
	targetRule[fieldName] = event.target.type === "checkbox" ? event.target.checked : event.target.value;

	if (fieldName === "matchUrl" || fieldName === "regexFlags") {
		const matchUrlInput = card.querySelector('[data-field="matchUrl"]');
		if (matchUrlInput) {
			matchUrlInput.classList.toggle("is-invalid", !isValidRegex(targetRule.matchUrl, targetRule.regexFlags));
		}
	}

	persistState().then(function() {
		renderValidationSummary();
	});
}

function getRuleCollection(type) {
	switch (type) {
		case "rewrite":
			return appState.rewriteRules;
		case "proxy":
			return appState.proxyRules;
		case "script":
			return appState.scriptRules;
		case "mock":
			return appState.mockRules;
		case "watchdog":
			return appState.watchdogRules;
		default:
			return [];
	}
}

function assignRuleCollection(type, value) {
	switch (type) {
		case "rewrite":
			appState.rewriteRules = value;
			break;
		case "proxy":
			appState.proxyRules = value;
			break;
		case "script":
			appState.scriptRules = value;
			break;
		case "mock":
			appState.mockRules = value;
			break;
		case "watchdog":
			appState.watchdogRules = value;
			break;
	}
}

async function saveAndRender() {
	await setState(appState);
	await refreshRuntimeState();
	render();
}

async function persistState() {
	await setState(appState);
	await refreshRuntimeState();
}

async function refreshRuntimeState() {
	const response = await sendRuntimeMessage({ type: "RUNTIME_GET_STATE" });
	runtimeState = response && response.ok ? response.data : null;
}

async function refreshRuntimeStateAndRender() {
	await refreshRuntimeState();
	if (appState.ui.activeTab === "profiling") {
		renderProfiling();
		renderRuntimeHealth();
	}
	if (appState.ui.activeTab === "watchdog") {
		renderWatchdogMatches();
	}
}

function createRewriteRule() {
	return {
		id: createId("rewrite"),
		name: "",
		active: true,
		matchUrl: "",
		replacementUrl: "",
		requestHeaders: "",
		responseHeaders: "",
		regexFlags: "gi"
	};
}

function createProxyRule() {
	return {
		id: createId("proxy"),
		name: "",
		active: true,
		matchUrl: "",
		regexFlags: "gi",
		proxyScheme: "http",
		proxyLocation: "",
		proxyPort: ""
	};
}

function createScriptRule() {
	return {
		id: createId("script"),
		name: "",
		active: true,
		matchUrl: "",
		regexFlags: "gi",
		source: "",
		injectInto: "head"
	};
}

function createMockRule() {
	return {
		id: createId("mock"),
		name: "",
		active: true,
		matchUrl: "",
		regexFlags: "gi",
		method: "ANY",
		status: "200",
		responseHeaders: "content-type: application/json",
		responseBody: "{}"
	};
}

function createWatchdogRule() {
	return {
		id: createId("watchdog"),
		name: "",
		active: true,
		matchUrl: "",
		regexFlags: "gi",
		method: "ANY",
		status: "ANY"
	};
}

/* groupRequestsByDomain always calls this after already checking both
   timestamps are present, so the null path below is defensive rather than
   reachable today — kept anyway since "no data yet" and "genuinely 0ms"
   are meaningfully different and a future caller shouldn't have to
   rediscover that distinction. */
function calculateDuration(request) {
	if (!request.timeStampStart || !request.timeStampEnd) {
		return null;
	}

	return Math.max(0, Math.round(request.timeStampEnd - request.timeStampStart));
}

function groupRequestsByDomain(requestList) {
	const grouped = new Map();

	requestList.forEach(function(request) {
		if (!request.timeStampStart || !request.timeStampEnd) {
			return;
		}

		const domain = extractDomain(request.url);
		const duration = calculateDuration(request);
		if (!grouped.has(domain)) {
			grouped.set(domain, {
				domain: domain,
				duration: 0,
				requestCount: 0
			});
		}

		const entry = grouped.get(domain);
		entry.duration += duration;
		entry.requestCount += 1;
	});

	return Array.from(grouped.values()).sort(function(a, b) {
		return b.duration - a.duration;
	});
}

function extractDomain(url) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch (error) {
		return "Unknown";
	}
}

function domainColor(index) {
	const colors = ["#89b4fa", "#cba6f7", "#a6e3a1", "#f9e2af", "#fab387", "#6c7086"];
	return colors[index % colors.length];
}

function donutSlicePath(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
	const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
	const outerStart = polarToCartesian(cx, cy, outerRadius, endAngle);
	const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
	const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
	const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);

	return [
		"M", outerStart.x, outerStart.y,
		"A", outerRadius, outerRadius, 0, largeArc, 0, outerEnd.x, outerEnd.y,
		"L", innerStart.x, innerStart.y,
		"A", innerRadius, innerRadius, 0, largeArc, 1, innerEnd.x, innerEnd.y,
		"Z"
	].join(" ");
}

function polarToCartesian(cx, cy, radius, angle) {
	return {
		x: cx + (radius * Math.cos(angle)),
		y: cy + (radius * Math.sin(angle))
	};
}

function appendIssueItems(items, label, entries) {
	entries.forEach(function(entry) {
		entry.issues.forEach(function(issue) {
			items.push(label + " " + (entry.name || entry.id) + ": " + issue);
		});
	});
}

function escapeHtml(value) {
	return String(value == null ? "" : value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function handleDomainChartHover(event) {
	const slice = event.target.closest("path[data-domain]");
	if (!slice) {
		return;
	}

	const domain = slice.getAttribute("data-domain") || "Unknown";
	const duration = slice.getAttribute("data-duration") || "0";
	const requests = slice.getAttribute("data-requests") || "0";
	const share = slice.getAttribute("data-share") || "0";

	const panel = document.getElementById("profileHoverPanel");
	const title = document.getElementById("profileHoverTitle");
	const grid = document.getElementById("profileHoverGrid");

	title.textContent = "Domain • " + domain;
	grid.innerHTML = renderHoverMetrics([
		{ label: "Share", value: share + "%" },
		{ label: "Requests", value: requests },
		{ label: "Duration", value: duration + "ms" }
	]);

	panel.classList.remove("is-hidden");
	positionHoverPanel(event, panel);
}

/* A plain N-column grid of small labeled stat boxes, used by domain-chart
   hover (handleDomainChartHover above). */
function renderHoverMetrics(items) {
	return '<div class="hover-panel-metrics" style="grid-template-columns: repeat(' + items.length + ', 1fr);">' +
		items.map(function(item) {
			return [
				'<div class="hover-panel-metric">',
				'<span class="hover-panel-label">' + escapeHtml(item.label) + "</span>",
				'<span class="hover-panel-value">' + escapeHtml(item.value) + "</span>",
				"</div>"
			].join("");
		}).join("") +
		"</div>";
}

function positionHoverPanel(event, panel) {
	const padding = 12;
	const cursorOffset = 14;
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;
	const rect = panel.getBoundingClientRect();
	const nextLeft = clamp(event.clientX + cursorOffset, padding, Math.max(padding, viewportWidth - rect.width - padding));
	const nextTop = clamp(event.clientY + cursorOffset, padding, Math.max(padding, viewportHeight - rect.height - padding));
	panel.style.left = nextLeft + "px";
	panel.style.top = nextTop + "px";
}

function hideHoverPanel() {
	const panel = document.getElementById("profileHoverPanel");
	if (!panel) {
		return;
	}

	panel.classList.add("is-hidden");
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function sendRuntimeMessage(message) {
	return new Promise(function(resolve) {
		chrome.runtime.sendMessage(message, function(response) {
			resolve(response);
		});
	});
}
