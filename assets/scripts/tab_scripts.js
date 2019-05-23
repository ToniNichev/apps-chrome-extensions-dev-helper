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
function addScript(script_location, execute_type, active) {
	var bkg = chrome.extension.getBackgroundPage();
	
	// uuid for the panels
	var c = new Date().getTime();
	// draw the proxy rule
	var htmlText =  '<div class="script_boxes fly_box" id="script_box_id_' + c + '">' + $('#scripts_template').html() + '</div>';
	// add the script rule box
	$('#scripts_list').append(htmlText);
	// set up the parameters
	$('#scripts_list #script_box_id_' + c + ' .script_location').html(script_location);
	$('#scripts_list #script_box_id_' + c + ' .script_location').keyup(function(){ saveScript() });
	
	if(typeof $('#scripts_list #script_box_id_' + c + ' .execute_type option')[execute_type] != 'undefined')
		$('#scripts_list #script_box_id_' + c + ' .execute_type option')[execute_type].selected = true;
	
	$('#scripts_list #script_box_id_' + c + ' .execute_type').change(function() {
		saveScript();
	});	
	// checkboxes
	$('#scripts_list #script_box_id_' + c + ' .active').prop('checked', active ? 1 : 0);
	$('#scripts_list #script_box_id_' + c + ' .active').click(function(){  saveScript() });
	// attach the close button action
	$('#scripts_list #script_box_id_' + c + ' .head a').click(
			function() {
				deleteScriptPanel(c);
			}
	);

	// set active/inactive background on creation
	if(active!='1')
		$('#scripts_list #script_box_id_' + c).addClass('box_inactive');

	// attach active/inactive action
	$('#scripts_list #script_box_id_' + c + ' .active').click(function() {
		if($(this).prop('checked'))
			$('#scripts_list #script_box_id_' + c).removeClass('box_inactive');
		else
			$('#scripts_list #script_box_id_' + c).addClass('box_inactive');
	});
	
			
	// make the pop-out animation effect
	window.setTimeout( function() { $('#scripts_list #script_box_id_' + c).addClass('fly_box-zoomed');} , 100);
	
	sanitizeContenteditableDivs();
}

/**
 *
 * @param id
 */

function deleteScriptPanel(id) {
	$('#script_box_id_' + id).removeClass('fly_box-zoomed')
	var domObj = $("#script_box_id_" + id)[0];
	window.setTimeout(function() {
		domObj.outerHTML = "";
		saveScript();
	}, 430);
}


/**
 *
 */
function clearScript() {
	$.ajax({
		  url: "api/clearproxyRule.php",
		})
		  .done(function( data ) {
			  $('#scripts_list').html('');
			  loadproxyRule();
		  });
}




/**
 * Saves the proxy rules into the DB
 */
function saveScript() {
	var rules = {};
	var co = 0;

	$("#scripts_list .script_boxes").each(function() {
		var script_location = stripHTMLTags($(this).find('.script_location').text());
		var execute_type = stripHTMLTags($(this).find('.execute_type').prop("selectedIndex"));
		
		var active = stripHTMLTags($(this).find('.active').prop('checked'));
		var global = stripHTMLTags($(this).find('.global').prop('checked'));
		var caseinsensitive = stripHTMLTags($(this).find('.caseinsensitive').prop('checked'));
		// prepare the object
		rules[co] = {id: co, script_location:script_location, execute_type:execute_type, active: active, global:global, caseinsensitive:caseinsensitive}
		co++;
	});
		
	localStorage.scripts_settings = JSON.stringify(rules);
}


// Attach the events

$(document).ready(function(){

	function getResponse(info) {		
	}
			

	
	$("#scripts_holder .pannel .add").click(function(obj) {
		addScript('', '', 1);
	});

	$("#scripts_holder .pannel .btn.saveScript").click(function(obj) {
		saveScript();
	});	
	
	if(typeof localStorage.scripts_settings != "undefined") {
		var scripts_settings = JSON.parse( localStorage.scripts_settings);
		if(scripts_settings != "undefined") {
		    for(var c in scripts_settings) {
		    		 addScript( scripts_settings[c].script_location,
		    					scripts_settings[c].execute_type,
		    					scripts_settings[c].active
		    		 );
		    }
		}
	}
});