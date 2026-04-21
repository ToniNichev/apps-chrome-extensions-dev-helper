document.addEventListener("DOMContentLoaded", function() {
	navTabs = new VCNavTabs();
	navTabs.init({
		targetElement: $("#VCMainNavTabs"),
		onTabClick: function(i) {
			hideAllMainTabs();
			switch (i) {
				case 0:
					$("#statistics_holder").css("display", "block");
					break;
				case 1:
					$("#rewrite_rules_holder").css("display", "block");
					break;
				case 2:
					$("#proxy_settings_holder").css("display", "block");
					break;
				case 3:
					$("#scripts_holder").css("display", "block");
					break;
				case 4:
					$("#about_holder").css("display", "block");
					break;
			}
		}
	});

	$("#how-to-link").on("click", function(e) {
		e.preventDefault();
		var url = "https://www.toni-develops.com/a-homepage-section/projects/using-dev-helper-chrome-extension-for-local-development/";
		chrome.tabs.create({ url: url, active: true });
		return false;
	});
});

function hideAllMainTabs() {
	$("#statistics_holder").css("display", "none");
	$("#rewrite_rules_holder").css("display", "none");
	$("#source_code_replace_holder").css("display", "none");
	$("#proxy_settings_holder").css("display", "none");
	$("#scripts_holder").css("display", "none");
	$("#about_holder").css("display", "none");
}

function strip(html) {
	var tempDiv = document.createElement("DIV");
	tempDiv.innerHTML = html;
	return tempDiv.innerText;
}

function sanitizeContenteditableDivs() {
	$("#wrapper div").each(function() {
		if ($(this).attr("contenteditable")) {
			$(this).bind("paste", function() {
				var self = this;
				setTimeout(function() {
					var tempDiv = document.createElement("DIV");
					tempDiv.innerHTML = $(self).html();
					$(self).html(tempDiv.innerText);
				}, 0);
			});
		}
	});
}

function addFormatedTextToDiv(divObject, txt) {
	var formatedText = txt.split(">").join("&gt;");
	formatedText = txt.split("<").join("&lt;");
	divObject.html(formatedText);
}

function stripHTMLTags(htmlText) {
	return htmlText;
}

function getStorageValue(key, callback) {
	chrome.storage.local.get(key, function(items) {
		callback(items[key]);
	});
}

function setStorageValue(key, value, callback) {
	var payload = {};
	payload[key] = value;
	chrome.storage.local.set(payload, function() {
		if (typeof callback === "function") {
			callback();
		}
	});
}

function sendBackgroundMessage(message, callback) {
	chrome.runtime.sendMessage(message, function(response) {
		if (chrome.runtime.lastError) {
			console.warn("Background message failed", message.type, chrome.runtime.lastError.message);
			if (typeof callback === "function") {
				callback(null);
			}
			return;
		}

		if (typeof callback === "function") {
			callback(response);
		}
	});
}
