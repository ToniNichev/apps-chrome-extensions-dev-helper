//var allRequests = {};
var backgroundPage = chrome.extension.getBackgroundPage();

document.addEventListener('DOMContentLoaded', function () {
   //var bg = chrome.extension.getBackgroundPage();
   //allRequests = bg.allRequests;
   
	// Main Nav Tabs
	navTabs = new VCNavTabs();
	navTabs.init({targetElement: $('#VCMainNavTabs') ,
				  onTabClick: function(i) {
					  hideAllMainTabs();
					  switch(i) {
					  	case 0:
					  		$("#statistics_holder").css('display', 'block');
					  		break;
					  	case 1:
					  		$("#rewrite_rules_holder").css('display', 'block');
							break;
					  	case 2:
					  		$("#proxy_settings_holder").css('display', 'block');					  		
					  		break;
					  	case 3:
							  $("#scripts_holder").css('display', 'block');
							break;
              case 4:
                $("#window_holder").css('display', 'block');                
              break;
              case 5:
					  		$("#about_holder").css('display', 'block');                
						break;
					  }
				  }
    });	
    

    $('#how-to-link').on('click', function(e){
      e.preventDefault();
      var url = 'https://www.toni-develops.com/a-homepage-section/projects/using-dev-helper-chrome-extension-for-local-development/';
      chrome.tabs.create({url: url, active: true});
      return false;
  });    
			       
});


function hideAllMainTabs() {
	$('#statistics_holder').css('display', 'none');
	$('#rewrite_rules_holder').css('display', 'none');
	$('#source_code_replace_holder').css('display', 'none');
	$("#proxy_settings_holder").css('display', 'none');
	$("#scripts_holder").css('display', 'none');
	$("#about_holder").css('display', 'none');  
}


function strip(html) {
    var tempDiv = document.createElement("DIV");
    tempDiv.innerHTML = html;
    return tempDiv.innerText;
}

function sanitizeContenteditableDivs() {
	// Attach paste events to contenteditable divs to sanitize pasted content (remove the styling)
	$("#wrapper div").each(function() {
		//@todo: check if the event is binded already
		if($(this).attr('contenteditable')   ) {			
			$(this).bind('paste',function() {
				var self = this;
				setTimeout( function() { 
					//alert($(self).html()); 
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

	// @TOFIX: this is removing the brackets for example: <script> ...
	var tempDiv = document.createElement("DIV");
	if(htmlText == '')
		return '';
	htmlText = htmlText.split('<').join('&lt;');
	htmlText = htmlText.split('>').join('&gt;');
	tempDiv.innerHTML = htmlText;
	tempDiv.innerText = tempDiv.innerText.split('&lt;').join('<');
	tempDiv.innerText = tempDiv.innerText.split('&gt;').join('>');
	return tempDiv.innerText;
}

/*
var background = chrome.extension.getBackgroundPage();
if (background.google && background.google.visualization) {
  var data = new background.google.visualization.DataTable();
}

*/