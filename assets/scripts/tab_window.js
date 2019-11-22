function test() {
  chrome.windows.getCurrent(function(win)
  {
    /*
      chrome.tabs.getAllInWindow(win.id, function(tabs)
      {
          // Should output an array of tab objects to your dev console.
          console.log(tabs);
          for(var i = 0;i < tabs.length; i++) {
            var tab = tabs[i];
            if(tab.active == true) {
              debugger;
              console.log(">>>", tab.width);
            }
          }

      });
        */

        chrome.windows.getLastFocused(
            {populate: false}, 
            function(currentWindow) {
                chrome.windows.update(currentWindow.id, { width: 100 });
            }
        );         
  }); 
}


function updateWindowWidth(newWidth) {
  chrome.windows.getLastFocused(
      {populate: false}, 
      function(currentWindow) {
          chrome.windows.update(currentWindow.id, { width: newWidth });
      }
  );    
}


$(document).ready(function(){
	$("#updateWindowWidth360").click(function(obj) {
		updateWindowWidth(360);
	}); 

	$("#updateWindowWidth760").click(function(obj) {
		updateWindowWidth(760);
	}); 

	$("#updateWindowWidth1020").click(function(obj) {
		updateWindowWidth(1020);
	}); 

	$("#updateWindowWidth1440").click(function(obj) {
		updateWindowWidth(1440);
	});       
});


