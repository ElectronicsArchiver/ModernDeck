import { make, exists, getIpc } from "./Utils.js";
import { mtdAlert } from "./UIAlert.js";
import { buildContextMenu } from "./UIContextMenu.js";
import { parseActions } from "./PrefHandler.js";
import { I18n } from "./I18n.js";

let offlineNotification;

/*
	Notifies users of an app update
*/

function notifyUpdate() {
	if (isDev) {
		return;
	}
	mtdAlert({
		title:I18n("Update ModernDeck"),
		message:I18n("An update is available for ModernDeck! Would you like to restart the app to install the update?"),
		buttonText:I18n("Restart Now"),
		button2Text:I18n("Later"),
		button1Click:() => {
			mtdPrepareWindows();
			require("electron").ipcRenderer.send("restartAndInstallUpdates")
		}
	});
}

/*
	Create offline notification (probably because we're offline)
*/

function notifyOffline() {

	if (exists(offlineNotification)) {
		return;
	}

	let notifRoot = mR.findFunction("showErrorNotification")[0].showNotification({title:I18n("Internet Disconnected"),timeoutDelayMs:9999999999});
	let notifId = notifRoot._id;
	offlineNotification = $("li.Notification[data-id=\""+notifId+"\"]");
	let notifContent = $("li.Notification[data-id=\""+notifId+"\"] .Notification-content");
	let notifIcon = $("li.Notification[data-id=\""+notifId+"\"] .Notification-icon .Icon");

	if (offlineNotification.length > 0) {
		notifIcon.removeClass("Icon--notifications").addClass("mtd-icon-disconnected");

		notifContent.append(
			make("p").html(I18n("We detected that you are disconnected from the internet. Many actions are unavailable without an internet connection."))
		)
	}
}

/*
	Dismiss offline notification (probably because we're online again)
*/

function dismissOfflineNotification() {
	if (!exists(window.offlineNotification)) {return;}
	mR.findFunction("showErrorNotification")[0].removeNotification({notification:offlineNotification});
}

/*
	mtdAppFunctions() consists of functions to help interface
	from here (the renderer process) to the main process
*/

export function mtdAppFunctions() {

	if (typeof require === "undefined") {return;}

	const { remote, ipcRenderer } = require('electron');

	const Store = require('electron-store');
	store = new Store({name:"mtdsettings"});


	// Enable high contrast if system is set to high contrast


	$(document).on("uiDrawerHideDrawer",(e) => {
		getIpc().send("drawerClose");
	});

	$(document).on("uiDrawerActive",(e) => {
		if (!$(".application").hasClass("hide-detail-view-inline"))
			getIpc().send("drawerOpen");
	});


	ipcRenderer.on("inverted-color-scheme-changed", (e, enabled) => {
		if (enabled && getPref("mtd_highcontrast") !== true) {
			try {
				settingsData.accessibility.options.highcont.activate.func();
			} catch(e){}
		}
	});

	ipcRenderer.on("color-scheme-changed", (e, theme) => {
		parseActions(settingsData.themes.options.coretheme.activate, theme);

	});

	ipcRenderer.on("disable-high-contrast", (e) => {
		console.info("DISABLING HIGH CONTRAST ");
		try {
			settingsData.accessibility.options.highcont.deactivate.func();
		} catch(e){}
	});

	ipcRenderer.on("aboutMenu", (e,args) => {
		if ($(".mtd-settings-tab[data-action=\"about\"]").length > 0){
			$(".mtd-settings-tab[data-action=\"about\"]").click();
		} else {
			openSettings("about");
		}
	});

	ipcRenderer.on("update-downloaded", (e,args) => {
		if ($("#settings-modal[style='display: block;']>.mtd-settings-panel").length <= 0 && !html.hasClass("mtd-winstore") && !html.hasClass("mtd-macappstore")) {
			notifyUpdate()
		}
	});

	ipcRenderer.on("openSettings", (e,args) => {
		openSettings();
	});

	ipcRenderer.on("accountsMan", (e,args) => {
		$(".js-show-drawer.js-header-action").click();
	});

	ipcRenderer.on("sendFeedback", (e,args) => {
		window.open("https://github.com/dangeredwolf/ModernDeck/issues");
	});

	ipcRenderer.on("msgModernDeck", (e,args) => {
		$(document).trigger("uiComposeTweet", {
			type: "message",
			messageRecipients: [{
				screenName: "ModernDeck"
			}]
		})
	});

	ipcRenderer.on("newTweet", (e,args) => {
		$(document).trigger("uiComposeTweet");
	});

	ipcRenderer.on("newDM", (e,args) => {
		$(document).trigger("uiComposeTweet");
		$(".js-dm-button").click();
	});

	let minimise, maximise, closeButton;

	if (html.hasClass("mtd-js-app")) {
		if ($(".windowcontrols").length <= 0) {
			minimise = make("button")
			.addClass("windowcontrol min")
			.html("&#xE15B")


			maximise = make("button")
			.addClass("windowcontrol max")
			.html("&#xE3C6")

			if (html.hasClass("mtd-maximized")) {
				maximise.html("&#xE3E0")
			}

			closeButton = make("button")
			.addClass("windowcontrol close")
			.html("&#xE5CD")

			let windowcontrols = make("div")
			.addClass("windowcontrols")
			.append(minimise)
			.append(maximise)
			.append(closeButton);

			body.append(windowcontrols,
				make("div").addClass("mtd-app-drag-handle")
			);
		} else {
			minimise = $(".windowcontrol.min");
			maximise = $(".windowcontrol.max");
			closeButton = $(".windowcontrol.close");

			if (html.hasClass("mtd-maximized")) {
				maximise.html("&#xE3E0")
			}
		}

		minimise.click((data,handler) => {
			ipcRenderer.send('minimize');
		});

		maximise.click((data,handler) => {
			ipcRenderer.send('maximizeButton');
		});

		closeButton.click(() => {
			window.close();
		});

	}

	ipcRenderer.on('context-menu', (event, p) => {
		const electron = require("electron")
		let theMenu = buildContextMenu(p);
		let menu = electron.remote.menu;
		let Menu = electron.remote.Menu;

		if (useNativeContextMenus || useSafeMode) {
			Menu.buildFromTemplate(theMenu).popup();
			return;
		} else {
			if (exists(theMenu))
				body.append(theMenu);
		}

	})

	const updateOnlineStatus = () => {

		if (!navigator.onLine) {
			notifyOffline();
		} else {
			dismissOfflineNotification();
		}

	}

	window.addEventListener("online", updateOnlineStatus);
	window.addEventListener("offline", updateOnlineStatus);

	updateOnlineStatus();
}
