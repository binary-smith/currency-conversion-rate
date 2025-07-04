import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Cairo from 'gi://cairo';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { PopupMenuItem, PopupSeparatorMenuItem } from 'resource:///org/gnome/shell/ui/popupMenu.js';

// Import both of our robust helpers
import { getSettings, fetchJSON } from './convenience.js';

// Custom Cairo-based line chart widget
const LineChart = GObject.registerClass(
    class LineChart extends St.DrawingArea {
      _init(data, width = 300, height = 150) {
        super._init({
          width: width,
          height: height,
          style_class: 'currency-line-chart'
        });

        this._data = data;
        this._width = width;
        this._height = height;

        this.connect('repaint', this._onRepaint.bind(this));
      }

      _onRepaint(area) {
        const cr = area.get_context();
        const [width, height] = area.get_surface_size();

        // Clear background
        cr.setSourceRGBA(0.1, 0.1, 0.1, 0.9);
        cr.rectangle(0, 0, width, height);
        cr.fill();

        if (this._data.length < 2) return;

        const padding = { top: 20, right: 20, bottom: 60, left: 70 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        // Get valid data points
        const validData = this._data.filter(d => d.rate !== undefined);
        if (validData.length < 2) return;

        // Calculate scales
        const rates = validData.map(d => d.rate);
        const minRate = Math.min(...rates);
        const maxRate = Math.max(...rates);
        const rateRange = maxRate - minRate;
        const ratePadding = rateRange * 0.1; // Add 10% padding

        // Draw axes
        cr.setSourceRGBA(0.5, 0.5, 0.5, 1);
        cr.setLineWidth(1);

        // Y-axis
        cr.moveTo(padding.left, padding.top);
        cr.lineTo(padding.left, height - padding.bottom);

        // X-axis
        cr.moveTo(padding.left, height - padding.bottom);
        cr.lineTo(width - padding.right, height - padding.bottom);
        cr.stroke();

        // Draw grid lines and Y-axis labels
        cr.setSourceRGBA(0.3, 0.3, 0.3, 0.5);
        cr.setLineWidth(0.5);

        const ySteps = 5;
        for (let i = 0; i <= ySteps; i++) {
          const y = padding.top + (i * chartHeight / ySteps);
          const value = maxRate + ratePadding - (i * (rateRange + 2 * ratePadding) / ySteps);

          // Grid line
          cr.moveTo(padding.left, y);
          cr.lineTo(width - padding.right, y);
          cr.stroke();

          // Label
          cr.setSourceRGBA(0.8, 0.8, 0.8, 1);
          cr.moveTo(5, y + 4);
          cr.showText(value.toFixed(4));
        }

        // Draw vertical grid lines for each date
        cr.setSourceRGBA(0.3, 0.3, 0.3, 0.3);
        validData.forEach((_, index) => {
          const x = padding.left + (index * chartWidth / (validData.length - 1));
          cr.moveTo(x, padding.top);
          cr.lineTo(x, height - padding.bottom);
          cr.stroke();
        });

        // Draw the line chart
        cr.setSourceRGBA(0.5, 0.8, 1, 1); // Light blue color
        cr.setLineWidth(2);

        validData.forEach((point, index) => {
          const x = padding.left + (index * chartWidth / (validData.length - 1));
          const y = padding.top + ((maxRate + ratePadding - point.rate) * chartHeight / (rateRange + 2 * ratePadding));

          if (index === 0) {
            cr.moveTo(x, y);
          } else {
            cr.lineTo(x, y);
          }
        });
        cr.stroke();

        // Draw data points
        cr.setSourceRGBA(0.3, 0.6, 1, 1);
        validData.forEach((point, index) => {
          const x = padding.left + (index * chartWidth / (validData.length - 1));
          const y = padding.top + ((maxRate + ratePadding - point.rate) * chartHeight / (rateRange + 2 * ratePadding));

          cr.arc(x, y, 3, 0, 2 * Math.PI);
          cr.fill();
        });

        // Draw X-axis labels (dates) - improved version
        cr.setSourceRGBA(0.8, 0.8, 0.8, 1);
        cr.setLineWidth(1);
        cr.setFontSize(10);

        // Calculate which labels to show based on available space
        const labelWidth = 35; // Approximate width needed per label
        const availableLabels = Math.floor(chartWidth / labelWidth);

        let labelIndices = [];
        if (availableLabels >= validData.length) {
          // Show all labels
          labelIndices = validData.map((_, i) => i);
        } else {
          // Always include first and last
          labelIndices.push(0);
          labelIndices.push(validData.length - 1);

          // Distribute remaining labels evenly
          const step = (validData.length - 1) / (availableLabels - 1);
          for (let i = 1; i < availableLabels - 1; i++) {
            labelIndices.push(Math.round(i * step));
          }

          // Remove duplicates and sort
          labelIndices = [...new Set(labelIndices)].sort((a, b) => a - b);
        }

        validData.forEach((point, index) => {
          const x = padding.left + (index * chartWidth / (validData.length - 1));

          // Draw tick marks for all points
          cr.moveTo(x, height - padding.bottom);
          cr.lineTo(x, height - padding.bottom + 5);
          cr.stroke();

          // Draw labels for selected indices
          if (labelIndices.includes(index)) {
            const dateParts = point.date.split('-');
            const shortDate = `${dateParts[2]}/${dateParts[1]}`;

            cr.save();

            // Rotate labels for better fit
            cr.translate(x, height - padding.bottom + 10);
            cr.rotate(Math.PI / 6); // 30 degrees

            cr.moveTo(0, 0);
            cr.showText(shortDate);

            cr.restore();
          }
        });

        // Add a title showing the full date range
        cr.setSourceRGBA(0.9, 0.9, 0.9, 1);
        cr.setFontSize(12);
        const firstDate = validData[0].date;
        const lastDate = validData[validData.length - 1].date;
        const title = `${firstDate} to ${lastDate}`;
        const titleExtents = cr.textExtents(title);
        cr.moveTo((width - titleExtents.width) / 2, padding.top - 5);
        cr.showText(title);

        cr.$dispose();
      }
      
      updateData(data) {
        this._data = data;
        this.queue_repaint();
      }
    });

const CurrencyIndicator = GObject.registerClass(
    class CurrencyIndicator extends PanelMenu.Button {
      // The _init method now accepts the full extension object.
      _init(settings, extension) {
        super._init(0.0, 'Currency Converter');
        this._settings = settings;
        // Store the extension object itself.
        this._extension = extension;

        // Main indicator layout for rate + difference
        const indicatorLayout = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
        this.label = new St.Label({
          text: 'Loading...',
          y_align: Clutter.ActorAlign.CENTER,
        });
        this._differenceIcon = new St.Icon({
          style_class: 'system-status-icon',
          y_align: Clutter.ActorAlign.CENTER,
          style: 'margin-left: 5px;',
          visible: false,
        });
        this._differenceLabel = new St.Label({
          y_align: Clutter.ActorAlign.CENTER,
          style: 'margin-left: 2px;',
          visible: false,
        });

        indicatorLayout.add_child(this.label);
        indicatorLayout.add_child(this._differenceIcon);
        indicatorLayout.add_child(this._differenceLabel);
        this.add_child(indicatorLayout);

        // --- Menu Items ---

        // Chart placeholder in the menu
        this._chartItem = new PopupMenuItem('', { reactive: false, can_focus: false });
        this._chartContainer = new St.BoxLayout({
          vertical: true,
          style: 'padding: 10px;'
        });
        this._chartItem.add_child(this._chartContainer);
        this.menu.addMenuItem(this._chartItem);

        // Initialize the line chart
        this._lineChart = new LineChart([], 500, 250);
        this._chartContainer.add_child(this._lineChart);

        // Separator
        this.menu.addMenuItem(new PopupSeparatorMenuItem());

        // Refresh Item
        const refreshItem = new PopupMenuItem('Refresh');
        refreshItem.connect('activate', () => this._updateExchangeRate());
        this.menu.addMenuItem(refreshItem);

        // Preferences Item
        const prefsItem = new PopupMenuItem('Preferences…');
        // This now calls a local method which calls the extension's method.
        prefsItem.connect('activate', () => this._openPreferences());
        this.menu.addMenuItem(prefsItem);

        // --- Connections and Timers ---
        this._settingsChangedId = this._settings.connect('changed', () => {
          this._updateExchangeRate();
        });

        this._timerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            30 * 60, // 30 minutes
            () => {
              this._updateExchangeRate();
              return GLib.SOURCE_CONTINUE; // Keep the timer running
            }
        );

        // Initial update
        this._updateExchangeRate();
      }

      // A helper method to call the extension's openPreferences.
      _openPreferences() {
        this._extension.openPreferences();
      }

      async _updateExchangeRate() {
        try {
          const base = this._settings.get_string('base-currency').toLowerCase();
          const target = this._settings.get_string('target-currency').toLowerCase();

          if (!base || !target) {
            this.label.set_text('Config Error');
            return;
          }

          // Generate dates for today and the last 10 days
          const dates = [];
          const today = GLib.DateTime.new_now_local();
          for (let i = 0; i < 11; i++) { // Today + 10 previous days
            dates.push(today.add_days(-i).format('%Y-%m-%d'));
          }

          // Create and run all API calls in parallel for efficiency
          const promises = dates.map(date => {
            const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${base}.min.json`;
            return fetchJSON(url);
          });

          const results = await Promise.all(promises);

          const todayData = results[0]?.[base];
          const yesterdayData = results[1]?.[base];

          const todayRate = todayData?.[target];
          const yesterdayRate = yesterdayData?.[target];

          if (todayRate === undefined) {
            this.label.set_text('Not supported yet');
            return;
          }

          // 1. Update main label
          this.label.set_text(`${base.toUpperCase()}/${target.toUpperCase()}: ${todayRate.toFixed(4)}`);

          // 2. Update difference from yesterday
          if (yesterdayRate !== undefined) {
            this._updateDifferenceIndicator(todayRate - yesterdayRate);
          } else {
            this._differenceIcon.visible = false;
            this._differenceLabel.visible = false;
          }

          // 3. Build and display the historical chart
          const historicalRates = results.map((res, index) => ({
            date: dates[index],
            rate: res[base]?.[target],
          })).reverse(); // Oldest first

          // Update the line chart with historical data (excluding today)
          this._lineChart.updateData(historicalRates.slice(0, 10));
        } catch (e) {
          console.error(`[CurrencyConverter] Failed to update rate: ${e}`);
          this.label.set_text('Error');
          // Show error message
          this._lineChart.updateData([]);
        }
      }

      _updateDifferenceIndicator(diff) {
        this._differenceIcon.visible = true;
        this._differenceLabel.visible = true;

        if (diff > 0.00001) {
          this._differenceIcon.icon_name = 'go-up-symbolic';
          this._differenceIcon.style = 'color: #26A269; margin-left: 5px;'; // Green
        } else if (diff < -0.00001) {
          this._differenceIcon.icon_name = 'go-down-symbolic';
          this._differenceIcon.style = 'color: #E01B24; margin-left: 5px;'; // Red
        } else {
          this._differenceIcon.icon_name = 'go-next-symbolic'; // Neutral
          this._differenceIcon.style = 'color: #888; margin-left: 5px;';
        }
        this._differenceLabel.text = Math.abs(diff).toFixed(4);
      }

      destroy() {
        if (this._timerId) {
          GLib.source_remove(this._timerId);
          this._timerId = null;
        }

        if (this._settingsChangedId) {
          this._settings.disconnect(this._settingsChangedId);
          this._settingsChangedId = null;
        }

        super.destroy();
      }
    }
);

export default class CurrencyConverterExtension extends Extension {
  enable() {
    this._settings = getSettings(this.uuid);
    // Pass `this` (the extension object) to the indicator.
    this._indicator = new CurrencyIndicator(this._settings, this);
    Main.panel.addToStatusArea(this.uuid, this._indicator);
  }

  disable() {
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
    this._settings = null;
  }
}