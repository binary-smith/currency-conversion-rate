import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

// Create a single, reusable Soup.Session for efficiency across the extension.
const _httpSession = new Soup.Session();

/**
 * Returns a Gio.Settings object for the extension's schema.
 * @param {string} uuid The UUID of the extension.
 * @returns {Gio.Settings}
 */
export function getSettings(uuid) {
    const extensionSchemaPath = GLib.build_filenamev([
        GLib.get_home_dir(),
        '.local',
        'share',
        'gnome-shell',
        'extensions',
        uuid,
        'schemas',
    ]);

    const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
        extensionSchemaPath,
        Gio.SettingsSchemaSource.get_default(),
        false
    );

    if (!schemaSource) {
        throw new Error(`Could not create schema source for ${uuid} at ${extensionSchemaPath}`);
    }

    const schemaId = 'org.gnome.shell.extensions.currency-conversion-rate';
    const schema = schemaSource.lookup(schemaId, true);
    if (!schema) {
        throw new Error(`Schema '${schemaId}' not found.`);
    }

    return new Gio.Settings({ settings_schema: schema });
}

/**
 * Performs an asynchronous network request and returns the parsed JSON.
 * This is a reusable helper to replace the browser's 'fetch' API.
 * @param {string} url The URL to fetch.
 * @returns {Promise<object>} A promise that resolves with the parsed JSON object.
 */
export function fetchJSON(url) {
    const message = Soup.Message.new('GET', url);

    return new Promise((resolve, reject) => {
        _httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
            try {
                const bytes = session.send_and_read_finish(result);

                if (message.get_status() !== Soup.Status.OK) {
                    reject(new Error(`HTTP error! status: ${message.get_status()}`));
                    return;
                }

                if (!bytes || bytes.get_size() === 0) {
                    reject(new Error('Empty response'));
                    return;
                }

                const decoder = new TextDecoder('utf-8');
                const response = decoder.decode(bytes.get_data());
                resolve(JSON.parse(response));
            } catch (e) {
                reject(e);
            }
        });
    });
}
