(function() {
	const injectedRuleIds = new Set();

	chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
		if (!message || !message.type) {
			return false;
		}

		if (message.type === "INJECT_SCRIPT_RULES" && Array.isArray(message.rules)) {
			const results = message.rules.map(function(rule) {
				return injectRule(rule);
			});

			sendResponse({
				ok: true,
				results: results
			});
			return false;
		}

		if (message.type === "SYNC_MOCK_RULES" && Array.isArray(message.rules)) {
			syncMockRulesIntoPage(message.rules);
			sendResponse({ ok: true });
			return false;
		}

		return false;
	});

	chrome.runtime.sendMessage({
		type: "RUNTIME_GET_MOCK_RULES",
		url: window.location.href
	}, function(response) {
		if (chrome.runtime.lastError) {
			return;
		}

		if (response && response.ok && Array.isArray(response.data)) {
			syncMockRulesIntoPage(response.data);
		}
	});

	function syncMockRulesIntoPage(rules) {
		window.postMessage({
			__devHelperMock: true,
			type: "MOCK_RULES_SYNC",
			rules: rules
		}, window.location.origin);
	}

	function injectRule(rule) {
		if (!rule || !rule.id || injectedRuleIds.has(rule.id)) {
			return { skipped: true, id: rule && rule.id ? rule.id : null };
		}

		if (rule.assetType === "js" && !isExtensionAsset(rule.source)) {
			return {
				id: rule.id,
				ok: false,
				error: "Remote JavaScript is not allowed in the MV3 app. Bundle the asset with the extension first."
			};
		}

		if (rule.assetType === "js") {
			appendScript(rule);
		} else {
			appendStylesheet(rule);
		}

		injectedRuleIds.add(rule.id);
		return { id: rule.id, ok: true };
	}

	function appendScript(rule) {
		const target = resolveTarget(rule.injectInto);
		const script = document.createElement("script");
		script.type = "text/javascript";
		script.async = true;
		script.src = rule.source;
		script.dataset.devHelperRuleId = rule.id;
		target.appendChild(script);
	}

	function appendStylesheet(rule) {
		const target = resolveTarget(rule.injectInto);
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.type = "text/css";
		link.href = rule.source;
		link.media = "all";
		link.dataset.devHelperRuleId = rule.id;
		target.appendChild(link);
	}

	function resolveTarget(injectInto) {
		if (injectInto === "body" && document.body) {
			return document.body;
		}

		return document.head || document.documentElement;
	}

	function isExtensionAsset(source) {
		return typeof source === "string" && source.indexOf(chrome.runtime.getURL("")) === 0;
	}
})();
