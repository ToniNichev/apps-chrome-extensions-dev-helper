function proxyTypeHideFields(proxy_type, divID) {
	proxy_type = proxy_type == "" ? proxy_type = 0 : proxy_type;
	$('#proxy_rule_box_id_' + divID + ' .proxy_location_and_port_wrapper').css('display', 'block');
	$('#proxy_rule_box_id_' + divID + ' .proxy_port_wrapper').css('display', 'block');
	switch(proxy_type) {
		case 0:
		case 1:
			$('#proxy_rule_box_id_' + divID + ' .proxy_location_and_port_wrapper').css('display', 'none');
			break;
		case 2:
		case 3:
		case 4:
			$('#proxy_rule_box_id_' + divID + ' .proxy_port_wrapper').css('display', 'none');
			break;
	}
	
}


/**
 * adds a proxy rule box and sets upt the parameters
 *
 * @param url
 * @param replacement
 * @param request_header_override
 * @param response_header_override 
 * @param active
 * @param global
 * @param caseinsensitive
 */
function addProxyRule(url, proxy_type, proxy_location, proxy_port, active, global, caseinsensitive) {
	
	var bkg = chrome.extension.getBackgroundPage();
	
	// uuid for the panels
	var c = new Date().getTime();
	// draw the proxy rule
	var htmlText =  '<div class="proxy_rule_boxes fly_box" id="proxy_rule_box_id_' + c + '">' + $('#proxy_rules_template').html() + '</div>';
	// add the proxy rule box
	$('#proxy_rules_list').append(htmlText);
	// set up the parameters
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .url').html(url);
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .url').keyup(function() { saveproxyRule() });
	
	if(typeof $('#proxy_rules_list #proxy_rule_box_id_' + c + ' .proxy_type option')[proxy_type] != 'undefined')
		$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .proxy_type option')[proxy_type].selected = true;
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .proxy_type').change(function() { saveproxyRule() });
	
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .proxy_location').html(proxy_location);
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .proxy_location').keyup(function() { saveproxyRule() });
	
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .proxy_port').html(proxy_port);
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .proxy_port').keyup(function() { saveproxyRule() });
	
	// checkboxes
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .active').prop('checked', active ? 1 : 0);
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .active').change(function() { saveproxyRule() });
	
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .global').prop('checked', global ? 1 : 0);
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .global').change(function() { saveproxyRule() });
	
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .caseinsensitive').prop('checked', caseinsensitive ? 1 : 0);
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .caseinsensitive').change(function() { saveproxyRule() });

	// attach the close button action
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .head a').click(
			function() {
				deleteproxyRulePanel(c);
			}
	);

	// set active/inactive background on creation
	if(active!='1')
		$('#proxy_rules_list #proxy_rule_box_id_' + c).addClass('box_inactive');

	// attach active/inactive action
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .active').click(function() {
		if($(this).prop('checked'))
			$('#proxy_rules_list #proxy_rule_box_id_' + c).removeClass('box_inactive');
		else
			$('#proxy_rules_list #proxy_rule_box_id_' + c).addClass('box_inactive');
	});

	// attach even to hide/show unused fields depending of the proxy type
	$('#proxy_rules_list #proxy_rule_box_id_' + c + ' .proxy_type').change(function() {
		var proxy_type = $('#proxy_rules_list #proxy_rule_box_id_' + c + ' .proxy_type').prop("selectedIndex");	
		proxyTypeHideFields(proxy_type, c);
	} );
		
	// hide unused fields depending of proxy type
	proxyTypeHideFields(proxy_type, c);
	
	// make the pop-out animation effect
	window.setTimeout( function() { $('#proxy_rules_list #proxy_rule_box_id_' + c).addClass('fly_box-zoomed');} , 100);
	
	sanitizeContenteditableDivs();
}

/**
 *
 * @param id
 */

function deleteproxyRulePanel(id) {
	$('#proxy_rule_box_id_' + id).removeClass('fly_box-zoomed')
	var domObj = $("#proxy_rule_box_id_" + id)[0];
	window.setTimeout(function() {
		domObj.outerHTML = "";
		saveproxyRule();
	}, 430);
}


/**
 *
 */
function clearproxyRule() {
	$.ajax({
		  url: "api/clearproxyRule.php",
		})
		  .done(function( data ) {
			  $('#proxy_rules_list').html('');
			  loadproxyRule();
		  });
}




/**
 * Saves the proxy rules into the DB
 */
function saveproxyRule() {
	var rules = {};
	var co = 0;

	$("#proxy_rules_list .proxy_rule_boxes").each(function() {
		var url = stripHTMLTags($(this).find('.url').text());
		var proxy_type = stripHTMLTags($(this).find('.proxy_type').prop("selectedIndex"));
		var proxy_location = stripHTMLTags($(this).find('.proxy_location').text());		
		var proxy_port = stripHTMLTags($(this).find('.proxy_port').text());		

		var active = stripHTMLTags($(this).find('.active').prop('checked'));
		var global = stripHTMLTags($(this).find('.global').prop('checked'));
		var caseinsensitive = stripHTMLTags($(this).find('.caseinsensitive').prop('checked'));
		// prepare the object
		rules[co] = {id: co, url:url, proxy_type:proxy_type, proxy_location:proxy_location, proxy_port:proxy_port, active: active, global:global, caseinsensitive:caseinsensitive}
		co++;
	});
		
	localStorage.proxy_rules = JSON.stringify(rules);
}


// Attach the events

$(document).ready(function(){
	$("#proxy_settings_holder .pannel .add").click(function(obj) {
		addProxyRule('','', '', '', 1, 1, 1);
	});

	$("#proxy_settings_holder .pannel .btn.saveRewriteRule").click(function(obj) {
		saveproxyRule();
	});	
	

	var proxy_rules = JSON.parse( localStorage.proxy_rules);
	
        
    for(var c in proxy_rules) {
    	addProxyRule( proxy_rules[c].url,
    					proxy_rules[c].proxy_type,		                         
    					proxy_rules[c].proxy_location,
    					proxy_rules[c].proxy_port,
    					proxy_rules[c].active,
    					proxy_rules[c].global,
    					proxy_rules[c].caseinsensitive);
    }        
});