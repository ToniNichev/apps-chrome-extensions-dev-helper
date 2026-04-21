document.addEventListener("DOMContentLoaded", function() {
	Tab_statistic.init();

	$("#statistics_holder #start_profiling").click(function() {
		sendBackgroundMessage({
			type: "SET_PROFILING",
			enabled: !Tab_statistic.startProfile
		}, function(response) {
			if (!response) {
				return;
			}

			Tab_statistic.startProfile = !!response.startProfile;
			Tab_statistic.setUpStartProfilingButton();
		});
	});
});

Tab_statistic = {
	startProfile: false,
	iframeBaseUrl: "",

	init: function() {
		this.refreshState();
	},

	refreshState: function(callback) {
		sendBackgroundMessage({ type: "GET_PROFILE_STATE" }, function(response) {
			if (!response) {
				return;
			}

			Tab_statistic.startProfile = !!response.startProfile;
			Tab_statistic.iframeBaseUrl = response.iframeBaseUrl || "";
			Tab_statistic.setUpStartProfilingButton();

			if (typeof callback === "function") {
				callback(response);
			}
		});
	},

	reloadProfile: function() {
		this.refreshState(function(response) {
			if (!response.startProfile || !Tab_statistic.iframeBaseUrl) {
				return;
			}

			var passed_data = JSON.stringify(response.allRequests || {});
			var iframe = document.getElementById("chart_iframe");
			if (!iframe || !iframe.contentWindow) {
				return;
			}

			iframe.contentWindow.postMessage(passed_data, Tab_statistic.iframeBaseUrl);
		});
	},
	
	setUpStartProfilingButton: function() {
		if (this.startProfile) {
			$("#statistics_holder #start_profiling").html("Stop Profiling");
			$("#statistics_holder #start_profiling").addClass("button_active");
		} else {
			$("#statistics_holder #start_profiling").html("Start Profiling");
			$("#statistics_holder #start_profiling").removeClass("button_active");
		}
	}
};

var intervalParam = window.setInterval(function() {
	Tab_statistic.reloadProfile();
}, 1000);
