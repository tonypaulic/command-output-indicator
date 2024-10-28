// extension.js
import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

// Configuration Constants with default values
let UPDATE_INTERVAL = 900; // Update interval in seconds (15 minutes)
let COMMAND_PATH = '/home/toz/Development/weatherAPI.sh'; // Path to the script to execute

// Settings Dialog
const SettingsWindow = GObject.registerClass(
    class SettingsWindow extends St.Widget {
        _init(callback) {
            super._init({
                layout_manager: new Clutter.BoxLayout({
                    orientation: Clutter.Orientation.VERTICAL,
                    spacing: 10
                }),
                style_class: 'settings-window',
                width: 400,
                height: -1,
                reactive: true
            });

            this._callback = callback;

            // Create window content
            this._contentBox = new St.BoxLayout({
                vertical: true,
                style_class: 'settings-box',
                y_expand: true,
                x_expand: true
            });

            // Title bar with full width and justified content
            let titleBar = new St.BoxLayout({
                style_class: 'settings-title-bar',
                x_expand: true // Make sure it spans full width
            });

            // Create a container for the title to handle alignment
            let titleContainer = new St.BoxLayout({
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER
            });

            let title = new St.Label({
                text: 'Command Output Indicator Settings',
                style_class: 'settings-title',
                y_align: Clutter.ActorAlign.CENTER
            });

            let closeButton = new St.Button({
                style_class: 'settings-close-button',
                child: new St.Icon({
                    icon_name: 'window-close-symbolic',
                    icon_size: 16
                })
            });
            closeButton.connect('clicked', () => this.destroy());

            // Add title to its container with padding
            titleContainer.add_child(title);

            // Add both containers to the title bar
            titleBar.add_child(titleContainer);
            titleBar.add_child(closeButton);

            // Command Path Input
            let commandBox = new St.BoxLayout({
                vertical: true,
                style_class: 'setting-row',
                x_expand: true
            });

            let commandLabel = new St.Label({
                text: 'Command Path:',
                style_class: 'setting-label'
            });

            this._commandEntry = new St.Entry({
                text: COMMAND_PATH,
                style_class: 'setting-entry',
                x_expand: true
            });

            commandBox.add_child(commandLabel);
            commandBox.add_child(this._commandEntry);

            // Update Interval Input
            let intervalBox = new St.BoxLayout({
                vertical: true,
                style_class: 'setting-row',
                x_expand: true
            });

            let intervalLabel = new St.Label({
                text: 'Update Interval (seconds):',
                style_class: 'setting-label'
            });

            this._intervalEntry = new St.Entry({
                text: UPDATE_INTERVAL.toString(),
                style_class: 'setting-entry',
                x_expand: true
            });

            intervalBox.add_child(intervalLabel);
            intervalBox.add_child(this._intervalEntry);

            // Button Box
            let buttonBox = new St.BoxLayout({
                style_class: 'settings-button-box',
                x_expand: true,
                x_align: Clutter.ActorAlign.END
            });

            let saveButton = new St.Button({
                style_class: 'settings-button',
                label: 'Save'
            });
            saveButton.connect('clicked', () => this._saveSettings());

            buttonBox.add_child(saveButton);

            // Add everything to the content box
            this._contentBox.add_child(titleBar);
            this._contentBox.add_child(commandBox);
            this._contentBox.add_child(intervalBox);
            this._contentBox.add_child(buttonBox);

            // Add content box to the widget
            this.add_child(this._contentBox);

            // Add to the UI group
            Main.uiGroup.add_child(this);

            // Center the window
            this._centerWindow();

            // Make it draggable
            this._draggable = new Clutter.DragAction();
            this._draggable.connect('drag-begin', () => {
                this._dragStartPosition = this.get_position();
            });
            this._draggable.connect('drag-end', () => {
                this._dragStartPosition = null;
            });
            this._draggable.connect('drag-progress', (action, actor, delta_x, delta_y) => {
                let [start_x, start_y] = this._dragStartPosition;
                this.set_position(start_x + delta_x, start_y + delta_y);
                return true;
            });
            this.add_action(this._draggable);

            // Make the title bar the drag handle
            titleBar.reactive = true;
            titleBar.bind_property('reactive', this._draggable, 'enabled', GObject.BindingFlags.SYNC_CREATE);
        }

        _centerWindow() {
            // Get the monitor that contains the mouse pointer
            let [mouseX, mouseY] = global.get_pointer();
            let monitor = Main.layoutManager.monitors[Main.layoutManager.primaryIndex];

            // Calculate the centered position
            let x = monitor.x + Math.floor((monitor.width - this.width) / 2);
            let y = monitor.y + Math.floor((monitor.height - this.height) / 2);

            // Set the position
            this.set_position(x, y);
        }

        _saveSettings() {
            const newCommand = this._commandEntry.get_text();
            const newInterval = parseInt(this._intervalEntry.get_text());

            if (isNaN(newInterval) || newInterval <= 0) {
                // Show error message
                Main.notify('Invalid interval value', 'Please enter a positive number');
                return;
            }

            // Update global settings
            COMMAND_PATH = newCommand;
            UPDATE_INTERVAL = newInterval;

            // Call the callback function
            if (this._callback) {
                this._callback(newCommand, newInterval);
            }

            this.destroy();
        }
    }
);

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
            
            this.label.clutter_text.set_use_markup(true);
            
            this.label.clutter_text.set_font_description(
                Pango.FontDescription.from_string('9')
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

            this._box = new St.BoxLayout({
                style_class: 'panel-status-menu-box'
            });

            this._icon = new St.Icon({
                icon_name: 'utilities-terminal-symbolic',
                style_class: 'system-status-icon'
            });

            this._label = new St.Label({
                text: 'Loading...',
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'command-output-label'
            });

            this._label.clutter_text.set_use_markup(true);

            this._box.add_child(this._icon);
            this._box.add_child(this._label);

            this.add_child(this._box);

            // Create menu item for tooltip content with markup support
            this._tooltipMenuItem = new MarkupMenuItem('Initializing...');
            this.menu.addMenuItem(this._tooltipMenuItem);
            
            // Add separator
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            // Add settings menu item
            this._settingsMenuItem = new PopupMenu.PopupMenuItem('Settings');
            this.menu.addMenuItem(this._settingsMenuItem);
            
            // Connect signals
            this._tooltipMenuItem.connect('activate', () => {
                log('Menu item clicked - updating output');
                this._resetTimeout();
                this._updateOutput();
            });

            this._settingsMenuItem.connect('activate', () => {
                this._showSettingsDialog();
            });
                        
            this._timeout = null;
            this._updateOutput();
        }

        _showSettingsDialog() {
            if (this._settingsWindow) {
                // If settings window exists, just focus it
                this._settingsWindow.destroy();
            }
            this._settingsWindow = new SettingsWindow((newCommand, newInterval) => {
                log(`Settings updated - Command: ${newCommand}, Interval: ${newInterval}`);
                this._resetTimeout();
                this._updateOutput();
                this._settingsWindow = null;
            });
}

        _parseXMLTags(output) {
            log(`Parsing output: ${output}`);
            const result = {
                icon: null,
                text: null,
                tooltip: null
            };

            try {
                const iconMatch = output.match(/<icon>(.*?)<\/icon>/);
                if (iconMatch) {
                    result.icon = iconMatch[1].trim();
                    log(`Found icon: ${result.icon}`);
                }

                const textMatch = output.match(/<txt>(.*?)<\/txt>/s);
                if (textMatch) {
                    result.text = textMatch[1].trim();
                    log(`Found text: ${result.text}`);
                }

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
                if (parsedOutput.icon) {
                    log(`Updating icon to: ${parsedOutput.icon}`);
                    this._icon.icon_name = parsedOutput.icon;
                }

                if (parsedOutput.text) {
                    log(`Updating text to: ${parsedOutput.text}`);
                    this._label.clutter_text.set_markup(parsedOutput.text);
                }

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
            if (this._settingsWindow) {
                this._settingsWindow.destroy();
                this._settingsWindow = null;
            }
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
