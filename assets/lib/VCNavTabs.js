/**
 * VCNavTabs V1.0
 *
 * @autor toni.nichev@gmail.com
 *
 */


var VCNavTabs = function(){};

(function() {
	VCNavTabs.prototype = {
			
			targetElement: null,
			onTabClick: null,
			onMouseOverTab: null,
			_prevTabIndex: 0,
			
			init: function(args) {
				var self = this;
				// setup the config parameters
				
				
				for(var param in args) {
				//	eval('this.' + param + ' = args.' + param + ';');
				}
				this.targetElement = args.targetElement;
				this.onTabClick = args.onTabClick;
				
				var bkg = chrome.extension.getBackgroundPage();
				
				// attach events
				this.targetElement.find('li').each(function(i) {
					self.targetElement.find('li').eq(i).click(function() {
						self.setActiveTab(i);
						if(self.onTabClick != null) {
							self.onTabClick(i);
						}
					})
					
					self.targetElement.find('li').eq(i).mouseover(function() {
						if(self.onMouseOverTab != null) {
							self.onMouseOverTab(i);
						}
					})
				});
			},
			
			
			setActiveTab: function(i) {
				this.targetElement.find('li').eq(this._prevTabIndex).removeClass('active');
				this.targetElement.find('li').eq(i).addClass('active');
				this._prevTabIndex = i;				
			}
	}

})($);
