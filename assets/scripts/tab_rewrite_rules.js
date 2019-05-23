/**
 * adds a rewrite rule box and sets upt the parameters
 *
 * @param url
 * @param replacement
 * @param request_header_override
 * @param response_header_override 
 * @param active
 * @param global
 * @param caseinsensitive
 */
function addRewriteRule(url, replacement, request_header_override, response_header_override, active, global, caseinsensitive) {
	
	var bkg = chrome.extension.getBackgroundPage();
	
	// uuid for the panels
	var c = new Date().getTime();
	// draw the rewrite rule
	//var htmlText = $('#rewrite_rules_list').html();
	var htmlText =  '<div class="rewrite_rule_boxes fly_box" id="rewrite_rule_box_id_' + c + '">' + $('#rewrite_rules_template').html() + '</div>';
	// add the rewrite rule box
	$('#rewrite_rules_list').append(htmlText);
	// set up the parameters
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .url').html(url);
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .url').keyup(function() { saveRewriteRule(); });
		
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .replacement').html(replacement);
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .replacement').keyup(function() { saveRewriteRule(); });
	
	//$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .port').html(port);	
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .request_header_override').html(request_header_override);
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .request_header_override').keyup(function() { saveRewriteRule(); });
	
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .response_header_override').html(response_header_override);
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .response_header_override').keyup(function() { saveRewriteRule(); });
	
	// checkboxes
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .active').prop('checked', active ? 1 : 0);
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .active').change(function() { saveRewriteRule(); });
	
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .global').prop('checked', global ? 1 : 0);
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .global').change(function() { saveRewriteRule(); });
	
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .caseinsensitive').prop('checked', caseinsensitive ? 1 : 0);
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .caseinsensitive').change(function() { saveRewriteRule(); });

	// attach the close button action
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .head a').click(
			function() {
				deleteRewriteRulePanel(c);
			}
	);

	// set active/inactive background on creation
	if(active!='1')
		$('#rewrite_rules_list #rewrite_rule_box_id_' + c).addClass('box_inactive');

	// attach active/inactive action
	$('#rewrite_rules_list #rewrite_rule_box_id_' + c + ' .active').click(function() {
		if($(this).prop('checked'))
			$('#rewrite_rules_list #rewrite_rule_box_id_' + c).removeClass('box_inactive');
		else
			$('#rewrite_rules_list #rewrite_rule_box_id_' + c).addClass('box_inactive');
	});

	// make the pop-out animation effect
	window.setTimeout( function() { $('#rewrite_rules_list #rewrite_rule_box_id_' + c).addClass('fly_box-zoomed');} , 100);
	
	sanitizeContenteditableDivs();
}

/**
 *
 * @param id
 */

function deleteRewriteRulePanel(id) {
	$('#rewrite_rule_box_id_' + id).removeClass('fly_box-zoomed')
	var domObj = $("#rewrite_rule_box_id_" + id)[0];
	window.setTimeout(function() {
		domObj.outerHTML = "";
		saveRewriteRule();
	}, 430);
}


/**
 *
 */
function clearRewriteRule() {
	$.ajax({
		  url: "api/clearRewriteRule.php",
		})
		  .done(function( data ) {
			  $('#rewrite_rules_list').html('');
			  loadRewriteRule();
		  });
}




/**
 * Saves the rewrite rules into the DB
 */
function saveRewriteRule() {
	var rules = {};
	var co = 0;

	$("#rewrite_rules_list .rewrite_rule_boxes").each(function() {
		var url = stripHTMLTags($(this).find('.url').text());
		var replacement = stripHTMLTags($(this).find('.replacement').text());
		var port = stripHTMLTags($(this).find('.port').text());		
		var _request_header_override = $(this).find('.request_header_override').val(); //stripHTMLTags($(this).find('.header_override').html());
		var _response_header_override = $(this).find('.response_header_override').val(); //stripHTMLTags($(this).find('.header_override').html());		

		var active = stripHTMLTags($(this).find('.active').prop('checked'));
		var global = stripHTMLTags($(this).find('.global').prop('checked'));
		var caseinsensitive = stripHTMLTags($(this).find('.caseinsensitive').prop('checked'));
		// clean up some parameters
		//header_override = header_override!='' ? header_override.replace(/<br\/?\s?>/gi, "\n") : '';
		// prepare the object
		rules[co] = {id: co, url:url, replacement:replacement,port:port, request_header_override: _request_header_override, response_header_override: _response_header_override, active: active, global:global, caseinsensitive:caseinsensitive}
		co++;
	});
		
	localStorage.rewrite_rules = JSON.stringify(rules);
}


// Attach the events

$(document).ready(function(){
	$("#rewrite_rules_holder .pannel .add").click(function(obj) {
		addRewriteRule('','', '', '', 1, 1, 1);
	});	

	$("#rewrite_rules_holder .pannel .saveRewriteRule").click(function(obj) {
		saveRewriteRule();
	});		

	//console.log("################################")
	//console.log(localStorage.rewrite_rules);
	if(typeof localStorage.rewrite_rules != "undefined") {
		var rewrite_rules = JSON.parse( localStorage.rewrite_rules);	    
	    
	    for(var c in rewrite_rules) {
	    	addRewriteRule( rewrite_rules[c].url,
	    					rewrite_rules[c].replacement,		                         
	    					rewrite_rules[c].request_header_override,
	    					rewrite_rules[c].response_header_override,    					
	    					rewrite_rules[c].active,
	    					rewrite_rules[c].global,
	    					rewrite_rules[c].caseinsensitive);
	    }        
	}
	
});