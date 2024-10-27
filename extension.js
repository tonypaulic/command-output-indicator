// extension.js
import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

// Configuration Constants
const UPDATE_INTERVAL = 900; // Update interval in seconds (15 minutes)
const COMMAND_PATH = '/home/toz/Development/weatherAPI.sh'; // Path to the script to execute

// Create a custom popup menu item that supports markup
const MarkupMenuItem = GObject.registerClass(
    class MarkupMenuItem extends PopupMenu.PopupBaseMenuItem {
        _init(text = '', params = {}) {
            super._init(params);

            this.label = new St.Label({
                text: text,
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'smaller-text'
            });
            
            // Enable markup parsing
            this.label.clutter_text.set_use_markup(true);
            
            // Set a smaller font size using the Pango markup
            this.label.clutter_text.set_font_description(
                Pango.FontDescription.from_string('9')  // Set font size to 9
            );
            
            this.add_child(this.label);
        }

        setMarkupText(text) {
            this.label.clutter_text.set_markup(text);
        }
    }
);

const CommandIndicator = GObject.registerClass(
    class CommandIndicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, 'Command Output Indicator');

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
                        
            this._timeout = null;
            this._updateOutput();
        }

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

        _escapeMarkup(text) {
            return text.replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&apos;');
        }

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

        async _updateOutput() {
            log('Starting _updateOutput');
            try {
                // Check if the command file exists
                const commandFile = Gio.File.new_for_path(COMMAND_PATH);
                const exists = commandFile.query_exists(null);
                if (!exists) {
                    log(`Command file does not exist at path: ${COMMAND_PATH}`);
                    this._label.set_text('Script not found');
                    return;
                }

                const [success, stdout, stderr, exitStatus] = await this._spawnCommandAsync(
                    [COMMAND_PATH]
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

            this._timeout = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT,
                UPDATE_INTERVAL,
                () => {
                    this._updateOutput();
                    return GLib.SOURCE_REMOVE;
                }
            );
        }

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
            this._resetTimeout();
            super.destroy();
        }
    }
);

export default class CommandOutputExtension {
    enable() {
        this._indicator = new CommandIndicator();
        Main.panel.addToStatusArea('command-output', this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
