config =  {
		init: function() {
		},
		ui: {
			start_profile: false
		},
		app_settings: {
			iframe_base_url: "http://chrome-dev-helper.toni-develops.com/",
			max_profile_records: 5000
		},
		feature_flags: {
			rewrite_rules_enabled: false,
			header_overrides_enabled: false,
			remote_js_injection_enabled: false
		},
		
        mode: "fixed_servers",
        rules: {
          proxyForHttp: {
            scheme: "socks5",
            host: "1.2.3.4"
          },
          bypassList: ["foo.com"]
        }		
}
	

config.init();


