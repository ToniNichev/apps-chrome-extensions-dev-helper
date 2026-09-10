import { createDefaultState, createId } from "../shared/schema.js";
import { getState, setState } from "../shared/storage.js";
import { isValidRegex, summarizeValidation, validateMockRule, validateProxyRule, validateRewriteRule, validateScriptRule } from "../shared/validation.js";

const extensionBaseUrl = chrome.runtime.getURL("");
const THEME_STORAGE_KEY = "sdtTheme";
let appState = createDefaultState();
let runtimeState = null;
let hoverState = {
	activeRequestId: null
};

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
	document.getElementById("profileTableBody").addEventListener("mousemove", handleProfileTableHover);
	document.getElementById("profileTableBody").addEventListener("mouseleave", hideHoverPanel);
	document.getElementById("waterfallWrap").addEventListener("mousemove", handleWaterfallHover);
	document.getElementById("waterfallWrap").addEventListener("mouseleave", hideHoverPanel);
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

function render() {
	renderTabs();
	renderProfiling();
	renderRuntimeHealth();
	renderValidationSummary();
	renderRewriteRules();
	renderProxyRules();
	renderScriptRules();
	renderMockRules();
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

	const completedRequests = requestList.filter(function(request) {
		return request.timeStampEnd;
	});
	const averageDuration = completedRequests.length
		? Math.round(completedRequests.reduce(function(sum, request) {
			return sum + calculateDuration(request);
		}, 0) / completedRequests.length)
		: 0;

	document.getElementById("profileStats").innerHTML = [
		statCard("Captured", String(requestList.length)),
		statCard("Completed", String(completedRequests.length)),
		statCard("Average ms", String(averageDuration)),
		statCard("Active", profile.enabled ? "Yes" : "No")
	].join("");

	document.getElementById("profileTableBody").innerHTML = requestList.slice(0, 100).map(function(request) {
		const requestId = request && request.requestId ? String(request.requestId) : "";
		const title = buildHoverTitle(request);
		return [
			'<tr data-request-id="' + escapeHtml(requestId) + '" title="' + escapeHtml(title) + '">',
			"<td>" + escapeHtml(request.method || "") + "</td>",
			"<td>" + escapeHtml(String(request.statusCode || "")) + "</td>",
			"<td>" + escapeHtml(request.type || "") + "</td>",
			"<td>" + escapeHtml(formatMs(calculateDuration(request))) + "</td>",
			'<td class="url-cell" title="' + escapeHtml(request.url || "") + '">' + escapeHtml(request.url || "") + "</td>",
			"</tr>"
		].join("");
	}).join("");

	renderWaterfallChart(requestList);
	renderDomainChart(requestList);

	// If the hovered request is no longer present, hide the panel.
	if (hoverState.activeRequestId && !(profile.requests && profile.requests[hoverState.activeRequestId])) {
		hideHoverPanel();
	}
}

function renderRuntimeHealth() {
	const target = document.getElementById("runtimeHealth");
	const dnrStatus = runtimeState && runtimeState.dnrStatus ? runtimeState.dnrStatus : null;

	if (!dnrStatus) {
		target.innerHTML = '<div class="status-list"><div class="status-pill is-error">Runtime state is unavailable.</div></div>';
		return;
	}

	const pills = [
		"Dynamic rules: " + dnrStatus.ruleCount,
		"Last sync: " + (dnrStatus.lastSyncedAt ? new Date(dnrStatus.lastSyncedAt).toLocaleTimeString() : "Not yet"),
		"Skipped rules: " + dnrStatus.skippedRules.length
	];

	if (dnrStatus.lastError) {
		pills.push("Last error: " + dnrStatus.lastError);
	}

	target.innerHTML = '<div class="status-list">' + pills.map(function(text, index) {
		const isError = index === pills.length - 1 && dnrStatus.lastError;
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

	target.innerHTML = '<div class="issue-list">' + items.map(function(item) {
		return '<div class="issue-pill is-warning">' + escapeHtml(item) + "</div>";
	}).join("") + "</div>";
}

function renderWaterfallChart(requestList) {
	const chart = document.getElementById("waterfallChart");
	const emptyState = document.getElementById("waterfallEmpty");
	const summary = document.getElementById("waterfallSummary");
	const legend = document.getElementById("waterfallLegend");
	const completedRequests = requestList.filter(function(request) {
		return request.timeStampStart && request.timeStampEnd;
	}).sort(function(a, b) {
		return a.timeStampStart - b.timeStampStart;
	}).slice(0, 16);

	if (!completedRequests.length) {
		chart.innerHTML = "";
		emptyState.classList.remove("is-hidden");
		summary.innerHTML = "";
		legend.innerHTML = "";
		return;
	}

	emptyState.classList.add("is-hidden");

	const width = 760;
	const rowHeight = 14;
	const rowGap = 8;
	const topPadding = 30;
	const leftPadding = 94;
	const rightPadding = 22;
	const bottomPadding = 18;
	const timelineWidth = width - leftPadding - rightPadding;
	const earliestStart = completedRequests[0].timeStampStart;
	const latestEnd = completedRequests.reduce(function(max, request) {
		return Math.max(max, request.timeStampEnd);
	}, earliestStart);
	const totalDuration = Math.max(1, latestEnd - earliestStart);
	const height = topPadding + bottomPadding + (completedRequests.length * (rowHeight + rowGap));
	const slowestRequest = completedRequests.reduce(function(slowest, request) {
		return calculateDuration(request) > calculateDuration(slowest) ? request : slowest;
	}, completedRequests[0]);
	const mainDocumentRequest = completedRequests.find(function(request) {
		return request.type === "main_frame";
	}) || null;

	chart.setAttribute("viewBox", "0 0 " + width + " " + height);

	summary.innerHTML = [
		'<div class="waterfall-chip">Span: ' + escapeHtml(String(Math.round(totalDuration))) + 'ms</div>',
		'<div class="waterfall-chip is-hot">Slowest: ' + escapeHtml(compactUrl(slowestRequest.url || "")) + " " + escapeHtml(String(calculateDuration(slowestRequest))) + 'ms</div>',
		'<div class="waterfall-chip">Avg TTFB: ' + escapeHtml(String(averageMetric(completedRequests, calculateTimeToFirstByte))) + 'ms</div>',
		mainDocumentRequest
			? '<div class="waterfall-chip">Document: ' + escapeHtml(String(Math.round(mainDocumentRequest.timeStampStart - earliestStart))) + "ms start</div>"
			: ""
	].join("");

	legend.innerHTML = [
		legendChip("Document", colorForRequestType("main_frame")),
		legendChip("Script", colorForRequestType("script")),
		legendChip("Stylesheet", colorForRequestType("stylesheet")),
		legendChip("XHR", colorForRequestType("xmlhttprequest")),
		legendChip("Image", colorForRequestType("image")),
		legendChip("Wait / TTFB overlay", "#a6adc8", true)
	].join("");

	const axis = buildWaterfallAxis(leftPadding, topPadding, timelineWidth, totalDuration, height, mainDocumentRequest ? mainDocumentRequest.timeStampStart - earliestStart : null);
	const rows = completedRequests.map(function(request, index) {
		const y = topPadding + (index * (rowHeight + rowGap));
		const startOffset = request.timeStampStart - earliestStart;
		const duration = Math.max(2, request.timeStampEnd - request.timeStampStart);
		const x = leftPadding + ((startOffset / totalDuration) * timelineWidth);
		const barWidth = Math.max(2, (duration / totalDuration) * timelineWidth);
		const firstByteDuration = Math.max(0, calculateTimeToFirstByte(request));
		const downloadDuration = Math.max(0, calculateDownloadTime(request));
		const firstByteWidth = Math.min(barWidth, Math.max(0, (firstByteDuration / totalDuration) * timelineWidth));
		const firstByteMarkerX = x + firstByteWidth;
		const label = compactUrl(request.url || "");
		const color = colorForRequestType(request.type);
		const tooltip = [
			request.method || "",
			request.url || "",
			"Type: " + (request.type || "other"),
			"Start: " + Math.round(startOffset) + "ms",
			"TTFB: " + Math.round(firstByteDuration) + "ms",
			"Download: " + Math.round(downloadDuration) + "ms",
			"Duration: " + Math.round(duration) + "ms",
			request.statusCode ? "Status: " + request.statusCode : ""
		].filter(Boolean).join(" | ");
		const stroke = request.requestId === slowestRequest.requestId ? ' stroke="#cba6f7" stroke-width="1.5"' : "";

		return [
			'<text x="8" y="' + (y + 11) + '" font-size="10" fill="#a6adc8">' + escapeHtml(label) + "</text>",
			'<rect data-request-id="' + escapeHtml(String(request.requestId || "")) + '" x="' + x + '" y="' + y + '" width="' + barWidth + '" height="' + rowHeight + '" rx="6" fill="' + color + '"' + stroke + '><title>' + escapeHtml(tooltip) + '</title></rect>',
			(firstByteWidth > 0
				? '<rect data-request-id="' + escapeHtml(String(request.requestId || "")) + '" x="' + x + '" y="' + y + '" width="' + firstByteWidth + '" height="' + rowHeight + '" rx="6" fill="#11111b" opacity="0.35"><title>' + escapeHtml(tooltip) + '</title></rect>'
				: ""),
			(firstByteWidth > 0 && firstByteWidth < barWidth
				? '<line x1="' + firstByteMarkerX + '" y1="' + (y + 1) + '" x2="' + firstByteMarkerX + '" y2="' + (y + rowHeight - 1) + '" stroke="#cdd6f4" stroke-width="1.2"></line>'
				: ""),
			'<text x="' + Math.min(width - 34, x + barWidth + 6) + '" y="' + (y + 11) + '" font-size="10" fill="#a6adc8">' + escapeHtml(String(Math.round(duration)) + "ms") + "</text>"
		].join("");
	}).join("");

	chart.innerHTML = axis + rows;
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

function buildWaterfallAxis(leftPadding, topPadding, timelineWidth, totalDuration, chartHeight, documentOffset) {
	const marks = 4;
	const elements = [];

	for (let index = 0; index <= marks; index += 1) {
		const x = leftPadding + ((index / marks) * timelineWidth);
		const time = Math.round((index / marks) * totalDuration);
		elements.push('<line x1="' + x + '" y1="10" x2="' + x + '" y2="' + (topPadding - 4) + '" stroke="rgba(205,214,244,0.12)" stroke-width="1"></line>');
		elements.push('<text x="' + x + '" y="9" text-anchor="middle" font-size="10" fill="#a6adc8">' + escapeHtml(String(time) + "ms") + "</text>");
	}

	if (documentOffset !== null) {
		const markerX = leftPadding + ((documentOffset / totalDuration) * timelineWidth);
		elements.push('<line x1="' + markerX + '" y1="' + (topPadding - 2) + '" x2="' + markerX + '" y2="' + (chartHeight - 8) + '" stroke="#89b4fa" stroke-dasharray="3 3" stroke-width="1.2"></line>');
		elements.push('<text x="' + markerX + '" y="' + (topPadding - 8) + '" text-anchor="middle" font-size="10" fill="#89b4fa">document</text>');
	}

	return elements.join("");
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
		renderSelectField("Proxy Mode", "proxyMode", rule.proxyMode, [
			["direct", "Direct"],
			["system", "System Proxy"],
			["pac", "PAC URL"],
			["http", "HTTP Proxy"],
			["https", "HTTPS Proxy"]
		]),
		renderTextField("Proxy Location", "proxyLocation", rule.proxyLocation),
		renderTextField("Proxy Port", "proxyPort", rule.proxyPort),
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
		renderSelectField("Asset Type", "assetType", rule.assetType, [
			["css", "CSS URL"],
			["js", "Bundled JS Asset"]
		]),
		renderSelectField("Inject Into", "injectInto", rule.injectInto, [
			["head", "Head"],
			["body", "Body"]
		]),
		renderTextField("Source", "source", rule.source, "full-span"),
		'<p class="hint full-span">JavaScript must use an extension URL like <code>' + escapeHtml(chrome.runtime.getURL("app/injected/example.js")) + "</code>.</p>",
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
		proxyMode: "direct",
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
		assetType: "css",
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

function statCard(label, value) {
	return [
		'<article class="stat-card">',
		'<div class="stat-label">' + escapeHtml(label) + "</div>",
		'<div class="stat-value">' + escapeHtml(value) + "</div>",
		"</article>"
	].join("");
}

/* These three return null (not 0) when the timestamps needed aren't
   captured yet/at all — distinct from a genuine 0ms measurement, which is
   common for Download in particular (a small response's whole body often
   arrives in the same read as its headers). Callers that do arithmetic on
   the result (sums, comparisons, Math.max) are unaffected: null coerces to
   0 in numeric context. Callers that DISPLAY the result must check
   `!== null` rather than truthiness — see formatMs() below — since a
   truthy check would hide a real "0ms" the same way this whole comment
   exists to stop happening again. */
function calculateDuration(request) {
	if (!request.timeStampStart || !request.timeStampEnd) {
		return null;
	}

	return Math.max(0, Math.round(request.timeStampEnd - request.timeStampStart));
}

function calculateTimeToFirstByte(request) {
	if (!request.timeStampStart || !request.timeStampFirstByte) {
		return null;
	}

	return Math.max(0, Math.round(request.timeStampFirstByte - request.timeStampStart));
}

function calculateDownloadTime(request) {
	if (!request.timeStampFirstByte || !request.timeStampEnd) {
		return null;
	}

	return Math.max(0, Math.round(request.timeStampEnd - request.timeStampFirstByte));
}

function compactUrl(url) {
	try {
		const parsed = new URL(url);
		return parsed.hostname.replace(/^www\./, "").slice(0, 24);
	} catch (error) {
		return String(url).slice(0, 24);
	}
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

function colorForRequestType(type) {
	switch (type) {
		case "main_frame":
			return "#89b4fa";
		case "script":
			return "#cba6f7";
		case "stylesheet":
			return "#a6e3a1";
		case "xmlhttprequest":
			return "#f9e2af";
		case "image":
			return "#fab387";
		default:
			return "#6c7086";
	}
}

function legendChip(label, color, isSoft) {
	return '<div class="waterfall-chip"><span class="waterfall-swatch ' + (isSoft ? "is-soft" : "") + '" style="background:' + escapeHtml(color) + '"></span>' + escapeHtml(label) + "</div>";
}

function averageMetric(requests, getter) {
	if (!requests.length) {
		return 0;
	}

	const sum = requests.reduce(function(total, request) {
		return total + getter(request);
	}, 0);

	return Math.round(sum / requests.length);
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

function handleProfileTableHover(event) {
	if (!(runtimeState && runtimeState.profile && runtimeState.profile.requests)) {
		return;
	}

	const row = event.target.closest("tr[data-request-id]");
	if (!row) {
		hideHoverPanel();
		return;
	}

	const requestId = row.dataset.requestId;
	const request = runtimeState.profile.requests[requestId];
	if (!request) {
		hideHoverPanel();
		return;
	}

	hoverState.activeRequestId = requestId;
	showHoverPanel(event, request);
}

function handleWaterfallHover(event) {
	if (!(runtimeState && runtimeState.profile && runtimeState.profile.requests)) {
		return;
	}

	const bar = event.target.closest("[data-request-id]");
	if (!bar) {
		return;
	}

	const requestId = bar.getAttribute("data-request-id");
	const request = runtimeState.profile.requests[requestId];
	if (!request) {
		return;
	}

	hoverState.activeRequestId = requestId;
	showHoverPanel(event, request);
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

function showHoverPanel(event, request) {
	const panel = document.getElementById("profileHoverPanel");
	const title = document.getElementById("profileHoverTitle");
	const grid = document.getElementById("profileHoverGrid");

	title.textContent = buildHoverTitle(request);
	grid.innerHTML = renderHoverMetrics(buildHoverMetrics(request))
		+ '<div class="hover-panel-meta">' + escapeHtml(buildHoverMeta(request)) + "</div>"
		+ renderHoverUrl(request && request.url ? String(request.url) : "");

	panel.classList.remove("is-hidden");
	positionHoverPanel(event, panel);
}

/* Shared by request-row and domain-chart hover paths — a plain N-column
   grid of small labeled stat boxes. Kept separate from the URL/meta
   markup below since domain-chart hover (handleDomainChartHover) only
   ever needs this part. */
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

/* A URL can run to hundreds of characters (query strings, tokens) — letting
   it wrap freely, like the rest of this panel's values used to, is what
   made the panel balloon past the popup's own height on real traffic.
   -webkit-line-clamp caps it to a predictable 2 lines regardless of length;
   .hover-panel itself also gets a hard max-height + overflow-y as a second,
   unconditional safety net (see popup.css). */
function renderHoverUrl(url) {
	if (!url) {
		return "";
	}
	return [
		'<div class="hover-panel-url-block">',
		'<span class="hover-panel-label">URL</span>',
		'<div class="hover-panel-url">' + escapeHtml(url) + "</div>",
		"</div>"
	].join("");
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
	hoverState.activeRequestId = null;
	const panel = document.getElementById("profileHoverPanel");
	if (!panel) {
		return;
	}

	panel.classList.add("is-hidden");
}

function buildHoverTitle(request) {
	const url = request && request.url ? String(request.url) : "";
	try {
		const parsed = new URL(url);
		return parsed.hostname.replace(/^www\./, "") + " • " + (request.method || "").toUpperCase();
	} catch (error) {
		return (request.method || "").toUpperCase() + (url ? " • " + url : "");
	}
}

/* The 4 numbers worth a glance at a hover — status/timing breakdown. */
function buildHoverMetrics(request) {
	const duration = calculateDuration(request);
	const ttfb = calculateTimeToFirstByte(request);
	const download = calculateDownloadTime(request);

	return [
		{ label: "Status", value: request && request.statusCode ? String(request.statusCode) : "—" },
		{ label: "Duration", value: formatMs(duration) },
		{ label: "TTFB", value: formatMs(ttfb) },
		{ label: "Download", value: formatMs(download) }
	];
}

/* null means "not captured" → "—"; any number (0 included — see the
   comment on calculateDuration/TimeToFirstByte/DownloadTime above) is a
   real measurement and must display as such, not get swallowed by a
   truthiness check. */
function formatMs(value) {
	return value === null || value === undefined ? "—" : String(value) + "ms";
}

/* Everything else (type, blocking reason, tab/request IDs, start time) is
   secondary lookup info rather than at-a-glance profiling data — folded
   into one compact line instead of 5 more grid boxes, which is what used
   to push this panel's height well past the popup's own 600px. */
function buildHoverMeta(request) {
	const startedAt = request && request.timeStampStart ? new Date(request.timeStampStart).toLocaleTimeString() : null;
	const tabId = request && typeof request.tabId === "number" ? "Tab " + request.tabId : null;

	return [
		request && request.type ? String(request.type) : null,
		request && request.blocking ? "Blocking: " + request.blocking : null,
		tabId,
		startedAt
	].filter(Boolean).join("  ·  ") || "—";
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
