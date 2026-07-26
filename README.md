# GNOME Shell Command Output Indicator Extension

A GNOME Shell extension that cyclically displays the output of a command. Supports also adding an icon to the top bar and text as a tooltip menu item

Instructions:
1. Copy the extension files to your GNOME Shell extensions directory:
   ```bash
   mkdir ~/.local/share/gnome-shell/extensions/command-output-indicator@toz
   cp -r . ~/.local/share/gnome-shell/extensions/command-output-indicator@toz

2. Copy org.gnome.shell.extensions.command-output.gschema.xml to $HOME/.local/share/glib-2.0/schemas
3. Then compile the schema:
```bash
glib-compile-schemas $HOME/.local/share/glib-2.0/schemas
```

4. The weather script is configured in dconf (gsettings):
   
    - COMMAND_PATH: Path to your script
    - UPDATE_INTERVAL: Update interval in seconds
   
    Note: Your script needs to echo out certain xml tags:
	<icon>icon name</icon>	
	<txt>top bar text</txt>
	<tool>text to display in tooltip</tool>
	Example script:

		echo "<icon>icon-name</icon>"
		echo "<txt>Some text here</txt>"
		echo "<tool>Tooltip text here</tool>"

6. Restart GNOME shell and ensure extension is enabled.

TODO: automate this process
