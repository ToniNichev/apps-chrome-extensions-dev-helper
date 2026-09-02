(function() {
	if (window.__devHelperMockInstalled) {
		return;
	}
	window.__devHelperMockInstalled = true;

	const originalFetch = window.fetch ? window.fetch.bind(window) : null;
	const OriginalXHR = window.XMLHttpRequest;
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

	if (originalFetch) {
		window.fetch = function(input, init) {
			const url = resolveRequestUrl(input);
			const method = resolveRequestMethod(input, init);
			const rule = findMatchingRule(url, method);

			if (!rule) {
				return originalFetch(input, init);
			}

			return Promise.resolve(buildMockResponse(rule));
		};
	}

	if (OriginalXHR) {
		installXhrInterceptor(OriginalXHR);
	}

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
		const headers = new Headers();
		parseHeaderPairs(rule.responseHeaders).forEach(function(pair) {
			headers.append(pair[0], pair[1]);
		});

		return new Response(rule.responseBody || "", {
			status: resolveMockStatus(rule),
			headers: headers
		});
	}

	function resolveMockStatus(rule) {
		const status = parseInt(rule.status, 10);
		return Number.isNaN(status) ? 200 : status;
	}

	function parseHeaderPairs(rawHeaders) {
		const pairs = [];

		String(rawHeaders || "").split("\n").forEach(function(line) {
			const separatorIndex = line.indexOf(":");
			if (separatorIndex === -1) {
				return;
			}

			const name = line.slice(0, separatorIndex).trim();
			const value = line.slice(separatorIndex + 1).trim();

			if (name) {
				pairs.push([name, value]);
			}
		});

		return pairs;
	}

	function installXhrInterceptor(OriginalXHR) {
		const originalOpen = OriginalXHR.prototype.open;
		const originalSend = OriginalXHR.prototype.send;

		OriginalXHR.prototype.open = function(method, url) {
			this.__devHelperMockMethod = String(method || "GET").toUpperCase();
			this.__devHelperMockUrl = String(url == null ? "" : url);
			this.__devHelperMockRule = null;
			return originalOpen.apply(this, arguments);
		};

		OriginalXHR.prototype.send = function(body) {
			const rule = findMatchingRule(this.__devHelperMockUrl, this.__devHelperMockMethod);

			if (!rule) {
				return originalSend.apply(this, arguments);
			}

			this.__devHelperMockRule = rule;
			dispatchMockXhrResponse(this, rule);
		};
	}

	function dispatchMockXhrResponse(xhr, rule) {
		const status = resolveMockStatus(rule);
		const headerPairs = parseHeaderPairs(rule.responseHeaders);
		const bodyText = rule.responseBody || "";

		setTimeout(function() {
			defineXhrState(xhr, OriginalXHR.HEADERS_RECEIVED, status, headerPairs, "");
			dispatchXhrEvent(xhr, "readystatechange");

			defineXhrState(xhr, OriginalXHR.LOADING, status, headerPairs, "");
			dispatchXhrEvent(xhr, "readystatechange");

			defineXhrState(xhr, OriginalXHR.DONE, status, headerPairs, bodyText);
			dispatchXhrEvent(xhr, "readystatechange");
			dispatchXhrEvent(xhr, "load", true);
			dispatchXhrEvent(xhr, "loadend", true);
		}, 0);
	}

	function defineXhrState(xhr, readyState, status, headerPairs, bodyText) {
		const headerText = headerPairs.map(function(pair) {
			return pair[0] + ": " + pair[1];
		}).join("\r\n");

		Object.defineProperty(xhr, "readyState", { value: readyState, configurable: true });
		Object.defineProperty(xhr, "status", { value: status, configurable: true });
		Object.defineProperty(xhr, "statusText", { value: statusTextFor(status), configurable: true });
		Object.defineProperty(xhr, "responseURL", { value: xhr.__devHelperMockUrl || "", configurable: true });
		Object.defineProperty(xhr, "responseText", { value: bodyText, configurable: true });
		Object.defineProperty(xhr, "response", { value: resolveXhrResponse(xhr, bodyText), configurable: true });

		xhr.getAllResponseHeaders = function() {
			return headerText ? headerText + "\r\n" : "";
		};

		xhr.getResponseHeader = function(name) {
			const lowerName = String(name || "").toLowerCase();
			const match = headerPairs.find(function(pair) {
				return pair[0].toLowerCase() === lowerName;
			});
			return match ? match[1] : null;
		};
	}

	function resolveXhrResponse(xhr, bodyText) {
		if (xhr.responseType === "json") {
			try {
				return JSON.parse(bodyText);
			} catch (error) {
				return null;
			}
		}

		if (xhr.responseType && xhr.responseType !== "text") {
			return bodyText;
		}

		return bodyText;
	}

	function statusTextFor(status) {
		const knownStatusText = {
			200: "OK", 201: "Created", 204: "No Content", 301: "Moved Permanently",
			302: "Found", 304: "Not Modified", 400: "Bad Request", 401: "Unauthorized",
			403: "Forbidden", 404: "Not Found", 500: "Internal Server Error",
			502: "Bad Gateway", 503: "Service Unavailable"
		};
		return knownStatusText[status] || "";
	}

	function dispatchXhrEvent(xhr, type, isProgressEvent) {
		const event = isProgressEvent
			? new ProgressEvent(type, { lengthComputable: false, loaded: 0, total: 0 })
			: new Event(type);
		xhr.dispatchEvent(event);
	}
})();
