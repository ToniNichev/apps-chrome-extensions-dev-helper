(function() {
	if (window.__devHelperMockInstalled) {
		return;
	}
	window.__devHelperMockInstalled = true;

	const originalFetch = window.fetch ? window.fetch.bind(window) : null;
	let matchers = [];

	window.addEventListener("message", function(event) {
		if (event.source !== window || !event.data || event.data.__devHelperMock !== true) {
			return;
		}

		if (event.data.type !== "MOCK_RULES_SYNC") {
			return;
		}

		matchers = compileMatchers(Array.isArray(event.data.rules) ? event.data.rules : []);
	});

	if (!originalFetch) {
		return;
	}

	window.fetch = function(input, init) {
		const url = resolveRequestUrl(input);
		const method = resolveRequestMethod(input, init);
		const rule = findMatchingRule(url, method);

		if (!rule) {
			return originalFetch(input, init);
		}

		return Promise.resolve(buildMockResponse(rule));
	};

	function compileMatchers(rules) {
		return rules.filter(function(rule) {
			return rule && rule.active;
		}).map(function(rule) {
			return {
				rule: rule,
				regex: compileRegex(rule.matchUrl, rule.regexFlags)
			};
		});
	}

	function compileRegex(pattern, flags) {
		if (!pattern) {
			return null;
		}

		try {
			return new RegExp(pattern, flags || "");
		} catch (error) {
			return null;
		}
	}

	function findMatchingRule(url, method) {
		for (let index = 0; index < matchers.length; index += 1) {
			const entry = matchers[index];
			const rule = entry.rule;

			if (!methodMatches(rule.method, method)) {
				continue;
			}

			if (entry.regex === null && rule.matchUrl) {
				continue;
			}

			if (entry.regex && !entry.regex.test(url)) {
				continue;
			}

			return rule;
		}

		return null;
	}

	function methodMatches(ruleMethod, requestMethod) {
		return !ruleMethod || ruleMethod === "ANY" || ruleMethod === requestMethod;
	}

	function resolveRequestUrl(input) {
		if (typeof input === "string") {
			return input;
		}

		if (input && typeof input === "object" && typeof input.url === "string") {
			return input.url;
		}

		return "";
	}

	function resolveRequestMethod(input, init) {
		if (init && init.method) {
			return String(init.method).toUpperCase();
		}

		if (input && typeof input === "object" && input.method) {
			return String(input.method).toUpperCase();
		}

		return "GET";
	}

	function buildMockResponse(rule) {
		const status = parseInt(rule.status, 10);
		return new Response(rule.responseBody || "", {
			status: Number.isNaN(status) ? 200 : status,
			headers: parseHeaderLines(rule.responseHeaders)
		});
	}

	function parseHeaderLines(rawHeaders) {
		const headers = new Headers();

		String(rawHeaders || "").split("\n").forEach(function(line) {
			const separatorIndex = line.indexOf(":");
			if (separatorIndex === -1) {
				return;
			}

			const name = line.slice(0, separatorIndex).trim();
			const value = line.slice(separatorIndex + 1).trim();

			if (name) {
				headers.append(name, value);
			}
		});

		return headers;
	}
})();
