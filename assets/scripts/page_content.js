/* Inform the backgrund page that
 * this tab should have a page-action */
chrome.runtime.sendMessage({
    from: "content",
    subject: "showPageAction"
});



 /* Jquery scripting is allowed here. */

/* Listen for message from the popup */
chrome.runtime.onMessage.addListener(function(msg, sender, response) {
	/* First, validate the message's structure */
    if (msg.from && (msg.from === "popup") && msg.subject && (msg.subject === "ScriptURL")) {

			/* Collect the necessary data  */

			var info = {};

			var url = msg.url;
			var type = url.split('.').pop();

			if(type == "js") {

				(function(d, script) {
					script = d.createElement('script');
					script.type = 'text/javascript';
					script.async = true;
					script.onload = function(){

						info.success = true;
						info.key = msg.key;
						response(info);
					};
					script.onerror= function() {

						info.success = false;
						info.key = msg.key;
						response(info);
					}
					script.src = msg.url;
					var attachTo = msg.executeType == 1 ? 'head' : 'body';
					d.getElementsByTagName(attachTo)[0].appendChild(script);
				}(document));

			} else if (type == "css") {

				(function(d, link) {
					link = d.createElement('link');
					link.type = 'text/css';
					link.rel = 'stylesheet';
					link.onload = function(){

						info.success = true;
						info.key = msg.key;
						response(info);
					};
					link.onerror= function() {

						info.success = false;
						info.key = msg.key;
						response(info);
					}
					link.href = msg.url;
					link.media = "all"
					var attachTo = msg.executeType == 1 ? 'head' : 'body';
					d.getElementsByTagName(attachTo)[0].appendChild(link);
				}(document));

			}

        /* Directly respond to the sender (popup),
         * through the specified callback */
        return true;
    }
});

// chrome.extension.sendMessage({message: "report"}, function(response) {});
