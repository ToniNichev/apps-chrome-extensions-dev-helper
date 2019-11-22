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
        */

        chrome.windows.getLastFocused(
            {populate: false}, 
            function(currentWindow) {
                chrome.windows.update(currentWindow.id, { width: 100 });
            }
        );          

      });
  }); 
}


function updateWindowWidth() {
  chrome.windows.getLastFocused(
      {populate: false}, 
      function(currentWindow) {
          chrome.windows.update(currentWindow.id, { width: 100 });
      }
  );    
}


$(document).ready(function(){
	$("#windowTest").click(function(obj) {
		test();
	}); 
});


