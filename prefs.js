import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

// Import our refined helpers
import { getSettings, fetchJSON } from './convenience.js';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const CurrencyPrefsPage = GObject.registerClass(
    class CurrencyPrefsPage extends Adw.PreferencesPage {
        _init(settings) {
            super._init({
                title: 'Currency Settings',
                icon_name: 'dialog-information-symbolic',
            });

            this._settings = settings;

            const group = new Adw.PreferencesGroup({
                title: 'Currency Selection',
                description: 'Choose your base and target currencies',
            });
            this.add(group);

            this._baseRow = new Adw.ComboRow({
                title: 'Base Currency',
                subtitle: 'E.g. ZAR',
            });
            group.add(this._baseRow);

            this._targetRow = new Adw.ComboRow({
                title: 'Target Currency',
                subtitle: 'E.g. INR',
            });
            group.add(this._targetRow);

            this._loadCurrencies();
        }

        async _loadCurrencies() {
            try {
                const url = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies.json';
                const data = await fetchJSON(url);

                const currencies = Object.keys(data).sort();
                const model = Gtk.StringList.new(currencies.map(c => c.toUpperCase()));

                this._baseRow.set_model(model);
                this._targetRow.set_model(model);

                const currentBase = this._settings.get_string('base-currency').toUpperCase();
                const currentTarget = this._settings.get_string('target-currency').toUpperCase();

                const baseIndex = currencies.findIndex(c => c.toUpperCase() === currentBase);
                if (baseIndex >= 0) this._baseRow.set_selected(baseIndex);

                const targetIndex = currencies.findIndex(c => c.toUpperCase() === currentTarget);
                if (targetIndex >= 0) this._targetRow.set_selected(targetIndex);

                this._baseRow.connect('notify::selected', () => {
                    const selected = currencies[this._baseRow.get_selected()];
                    if (selected) this._settings.set_string('base-currency', selected.toUpperCase());
                });

                this._targetRow.connect('notify::selected', () => {
                    const selected = currencies[this._targetRow.get_selected()];
                    if (selected) this._settings.set_string('target-currency', selected.toUpperCase());
                });

            } catch (error) {
                console.error('Failed to load currencies:', error);
                this._baseRow.set_sensitive(false);
                this._targetRow.set_sensitive(false);
                this._baseRow.set_subtitle('Failed to load currency list');
                this._targetRow.set_subtitle('Please check internet connection');
            }
        }
    }
);

export default class CurrencyConverterPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const page = new CurrencyPrefsPage(getSettings('currency-conversion-rate@optimus'));
        window.add(page);
    }
}