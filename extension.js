// extension.js
import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// stylesheet.css
//	.command-output-label {margin-left: 0px;}
//	.panel-status-menu-box {spacing: 0px;}
//	.smaller-text {font-size: 11pt;}

// GSettings Schema
// - filename: org.gnome.shell.extensions.command-output.gschema.xml
//	<schemalist gettext-domain="gnome-shell-extensions">
//	 <schema id="org.gnome.shell.extensions.command-output" path="/org/gnome/shell/extensions/command-output/">
//	  <key name="update-interval" type="i">
//	   <default>900</default>
//	   <summary>Update Interval</summary>
// 	   <description>Interval in seconds between command executions</description>
//	  </key>
//	  <key name="command-path" type="s">
//	   <default>''</default>
//	   <summary>Command Path</summary>
//	   <description>Full path to the script to be executed</description>
//	  </key>
//	 </schema>
//      </schemalist>
// - manual setup:
//    	- mkdir -p $HOME/.local/share/glib-2.0/schemas
//	- Copy your org.gnome.shell.extensions.command-output.gschema.xml file into that folder
//	- glib-compile-schemas $HOME/.local/share/glib-2.0/schemas
//	- use dconf-editor (or gsettings command) to set the "command-path" and "update-interval" properties
const GSETTINGS_SCHEMA = 'org.gnome.shell.extensions.command-output';
const GSETTINGS_UPDATE_INTERVAL_KEY = 'update-interval';
const GSETTINGS_COMMAND_PATH_KEY = 'command-path';

// Default values (see above to change)
const DEFAULT_UPDATE_INTERVAL = 900;
const DEFAULT_COMMAND_PATH = '';

// Create a custom popup menu item that supports markup
const MarkupMenuItem = GObject.registerClass(
    class MarkupMenuItem extends PopupMenu.PopupBaseMenuItem {
        _init(text = '', params = {}) {
            super._init(params);

	    // label properties
            this.label = new St.Label({
                text: text,
                x_expand: true,
		width: 600,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'smaller-text'
            });
            
            // Access the internal Clutter.Text actor to handle overflow
            const clutterText = this.label.clutter_text;
            clutterText.set_use_markup(true);
            // Wrap to new lines
            clutterText.line_wrap = true;
            clutterText.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            
            this.add_child(this.label);
        }

        setMarkupText(text) {
            this.label.clutter_text.set_markup(text);
        }
    }
);

// instantiate extension
const CommandIndicator = GObject.registerClass(
    class CommandIndicator extends PanelMenu.Button {
        _init(settings) {
            super._init(0.0, 'Command Output Indicator');
            
            // Store settings
            this._settings = settings;

            // Create a layout box to hold both icon and label
            this._box = new St.BoxLayout({
                style_class: 'panel-status-menu-box'
            });

            // Add an icon
            this._icon = new St.Icon({
                icon_name: 'utilities-terminal-symbolic',
                style_class: 'system-status-icon'
            });

            // Create the label
            this._label = new St.Label({
                text: 'Loading...',
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'command-output-label'
            });

            // Enable markup for the label
            this._label.clutter_text.set_use_markup(true);

            // Add both icon and label to the box
            this._box.add_child(this._icon);
            this._box.add_child(this._label);

            // Add the box to the panel button
            this.add_child(this._box);

            // Create menu item for tooltip content with markup support
            this._tooltipMenuItem = new MarkupMenuItem('Initializing...');
            this.menu.addMenuItem(this._tooltipMenuItem);
            
            // Connect to menuitem active signal
            this._tooltipMenuItem.connect('activate', () => {
                log('Menu item clicked - updating output');
                // Reset the timeout and update immediately when menu item is clicked
                this._resetTimeout();
                this._updateOutput();
            });
            
            // Connect to settings changes
            this._settingsChangedId = this._settings.connect(
                `changed::${GSETTINGS_UPDATE_INTERVAL_KEY}`, 
                () => this._onSettingsChanged()
            );
            this._settingsPathChangedId = this._settings.connect(
                `changed::${GSETTINGS_COMMAND_PATH_KEY}`, 
                () => this._onSettingsChanged()
            );
                        
            this._timeout = null;
            this._updateOutput();
        }
            
        _onSettingsChanged() {
            log('Settings changed, resetting timeout and updating output');
            this._resetTimeout();
            this._updateOutput();
        }

        // Getter for command path that uses GSettings
        _getCommandPath() {
            return this._settings.get_string(GSETTINGS_COMMAND_PATH_KEY) || DEFAULT_COMMAND_PATH;
        }

        // Getter for update interval that uses GSettings
        _getUpdateInterval() {
            return this._settings.get_int(GSETTINGS_UPDATE_INTERVAL_KEY) || DEFAULT_UPDATE_INTERVAL;
        }

	// parse the output from the script
	// supported tags this far:
	//	- icon = icon name for icon on topbar
	//	- txt = text to display to right of icon on topbar
	//	- tool = text to display in popup (tooltip)
        _parseXMLTags(output) {
            log(`Parsing output: ${output}`);
            const result = {
                icon: null,
                text: null,
                tooltip: null
            };

            try {
                // Parse icon tag
                const iconMatch = output.match(/<icon>(.*?)<\/icon>/);
                if (iconMatch) {
                    result.icon = iconMatch[1].trim();
                    log(`Found icon: ${result.icon}`);
                }

                // Parse text tag - now supporting Pango markup
                const textMatch = output.match(/<txt>(.*?)<\/txt>/s);
                if (textMatch) {
                    result.text = textMatch[1].trim();
                    log(`Found text: ${result.text}`);
                }

                // Parse tooltip tag - now supporting Pango markup
                const toolMatch = output.match(/<tool>(.*?)<\/tool>/s);
                if (toolMatch) {
                    result.tooltip = toolMatch[1].trim();
                    log(`Found tooltip: ${result.tooltip}`);
                }
            } catch (e) {
                log(`Error parsing XML tags: ${e}`);
            }

            return result;
        }

	// escape all special characters so they display properly
        _escapeMarkup(text) {
            return text.replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&apos;');
        }

	// update the contents of the extension (topbar and tooltip)
        _updateUI(parsedOutput) {
            try {
                // Update icon if provided
                if (parsedOutput.icon) {
                    log(`Updating icon to: ${parsedOutput.icon}`);
                    this._icon.icon_name = parsedOutput.icon;
                }

                // Update text if provided - now with markup support
                if (parsedOutput.text) {
                    log(`Updating text to: ${parsedOutput.text}`);
                    this._label.clutter_text.set_markup(parsedOutput.text);
                }

                // Update tooltip content in menu item with markup
                if (parsedOutput.tooltip) {
                    log(`Updating tooltip to: ${parsedOutput.tooltip}`);
                    this._tooltipMenuItem.setMarkupText(parsedOutput.tooltip);
                }
            } catch (e) {
                log(`Error updating UI: ${e}`);
            }
        }

        _resetTimeout() {
            if (this._timeout) {
                GLib.source_remove(this._timeout);
                this._timeout = null;
            }
        }

	// on update interval, update extension
        async _updateOutput() {
            log('Starting _updateOutput');
            try {            
                // Use the settings-based command path
                const commandPath = this._getCommandPath();
                
                // Check if the command file exists
                const commandFile = Gio.File.new_for_path(commandPath);
                const exists = commandFile.query_exists(null);
                if (!exists) {
                    log(`Command file does not exist at path: ${commandPath}`);
                    this._label.set_text('Script not found');
                    return;
                }

                const [success, stdout, stderr, exitStatus] = await this._spawnCommandAsync(
                    [commandPath]
                );

                log(`Command execution completed - Success: ${success}, Exit Status: ${exitStatus}`);
                log(`Stdout: ${stdout}`);
                if (stderr) log(`Stderr: ${stderr}`);

                if (success && exitStatus === 0) {
                    const parsedOutput = this._parseXMLTags(stdout);
                    this._updateUI(parsedOutput);
                } else {
                    const errorMsg = `Command failed (${exitStatus}): ${stderr}`;
                    log(errorMsg);
                    this._label.set_text('Error');
                    this._tooltipMenuItem.setMarkupText(this._escapeMarkup(errorMsg));
                }
            } catch (e) {
                const errorMsg = `Exception in command execution: ${e}`;
                log(errorMsg);
                this._label.set_text('Error');
                this._tooltipMenuItem.setMarkupText(this._escapeMarkup(errorMsg));
            }

            // Reset any existing timeout before setting a new one
            this._resetTimeout();

            // Use the settings-based update interval
            const updateInterval = this._getUpdateInterval();
            this._timeout = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                updateInterval,
                () => {
                    this._updateOutput();
                    return GLib.SOURCE_REMOVE;
                }
            );
        }

	// run the "command-output" script
        _spawnCommandAsync(argv) {
            return new Promise((resolve, reject) => {
                try {
                    log(`Executing command: ${argv.join(' ')}`);
                    const [success, pid, stdinFd, stdoutFd, stderrFd] = GLib.spawn_async_with_pipes(
                        null,
                        argv,
                        null,
                        GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
                        null
                    );

                    if (!success) {
                        reject(new Error('Failed to spawn command'));
                        return;
                    }

                    const stdoutStream = new Gio.UnixInputStream({ fd: stdoutFd, close_fd: true });
                    const stderrStream = new Gio.UnixInputStream({ fd: stderrFd, close_fd: true });
                    
                    const stdoutDis = new Gio.DataInputStream({ base_stream: stdoutStream });
                    const stderrDis = new Gio.DataInputStream({ base_stream: stderrStream });

                    let stdout = '';
                    let stderr = '';

                    GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (pid, exitStatus) => {
                        this._readStream(stdoutDis).then(output => {
                            stdout = output;
                            return this._readStream(stderrDis);
                        }).then(error => {
                            stderr = error;
                            resolve([true, stdout, stderr, exitStatus]);
                            
                            stdoutDis.close(null);
                            stderrDis.close(null);
                            GLib.spawn_close_pid(pid);
                        }).catch(error => {
                            reject(error);
                        });
                    });

                } catch (e) {
                    reject(e);
                }
            });
        }

        async _readStream(dataInputStream) {
            let output = '';
            let line;

            try {
                while ((line = await this._readLine(dataInputStream)) !== null) {
                    output += line + '\n';
                }
            } catch (e) {
                log(`Error reading stream: ${e}`);
            }

            return output;
        }

        _readLine(dataInputStream) {
            return new Promise((resolve, reject) => {
                dataInputStream.read_line_async(
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (source, result) => {
                        try {
                            const [line, length] = source.read_line_finish_utf8(result);
                            resolve(line);
                        } catch (e) {
                            reject(e);
                        }
                    }
                );
            });
        }

        destroy() {
            // Disconnect settings change signals
            if (this._settingsChangedId) {
                this._settings.disconnect(this._settingsChangedId);
            }
            if (this._settingsPathChangedId) {
                this._settings.disconnect(this._settingsPathChangedId);
            }
            
            this._resetTimeout();
            super.destroy();
        }
    }
);

export default class CommandOutputExtension {
    enable() {
        // Create GSettings
        this._settings = new Gio.Settings({ 
            schema_id: GSETTINGS_SCHEMA 
        });

        // Create indicator with settings
        this._indicator = new CommandIndicator(this._settings);
        Main.panel.addToStatusArea('command-output', this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;

        // Optional: Release settings reference
        this._settings = null;
    }
}
