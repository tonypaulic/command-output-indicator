# GNOME Shell Command Output Indicator Extension

A GNOME Shell extension that cyclically displays the output of a command. Supports also adding an icon to the top bar and text as a tooltip menu item

Instructions:
1. Copy the extension to your GNOME Shell extensions directory:
   ```bash
   mkdir ~/.local/share/gnome-shell/extensions/command-output-indicator@toz
   cp -r . ~/.local/share/gnome-shell/extensions/command-output-indicator@toz

2. The weather script path can be configured in extension.js:
    COMMAND_PATH: Path to your script
    UPDATE_INTERVAL: Update interval in seconds
    Note: Your script needs to echo out certain xml tags:
	<icon>icon name</icon>	
	<txt>top bar text</txt>
	<tool>text to display in tooltip</tool>
	Example script:
		```bash
		echo "<icon>icon-name</icon>"
		echo "<txt>Some text here</txt>"
		echo "<tool>Tooltip text here</tool>"

3. Restart GNOME shell and ensure extension is enabled.

