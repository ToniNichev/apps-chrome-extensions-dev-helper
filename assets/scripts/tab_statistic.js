

document.addEventListener('DOMContentLoaded', function () {
	
	Tab_statistic.init();
	
	// [Start / Stop] profiling button clicked
	$('#statistics_holder #start_profiling').click(function() {
		if(backgroundPage.config.ui.start_profile) {
			backgroundPage.config.ui.start_profile = false;
			//backgroundPage.allRequests = {};
			$('#statistics_holder #start_profiling').html('Start Profiling');
			$('#statistics_holder #start_profiling').removeClass("button_active");
		}
		else {
			backgroundPage.allRequests = {};
			backgroundPage.config.ui.start_profile = true
			$('#statistics_holder #start_profiling').html('Stop Profiling');
			$('#statistics_holder #start_profiling').addClass("button_active");
		}
	});
	
	/*
	$('#statistics_holder #clear_profiling_data').click(function() {
		backgroundPage.allRequests = {};		
	});
	*/
		
});

Tab_statistic =  {
		init: function() {
			this.setUpStartProfilingButton();
		},

		// Send data to the iframe
		reloadProfile: function() {
			if(backgroundPage.config.ui.start_profile) {
				var passed_data = JSON.stringify(backgroundPage.allRequests)
				
				var win = document.getElementById("chart_iframe").contentWindow
				win.postMessage(passed_data, backgroundPage.config.app_settings.iframe_base_url);		
			}			
		},
		
		setUpStartProfilingButton: function() {
			if(backgroundPage.config.ui.start_profile) {
				$('#statistics_holder #start_profiling').html('Stop Profiling'); 
				$('#statistics_holder #start_profiling').addClass("button_active");				
			}
			else {
				$('#statistics_holder #start_profiling').html('Start Profiling');	
				$('#statistics_holder #start_profiling').removeClass("button_active");
			}
		}
}

var intervalParam = window.setInterval(function() {
	Tab_statistic.reloadProfile();
}, 1000);

