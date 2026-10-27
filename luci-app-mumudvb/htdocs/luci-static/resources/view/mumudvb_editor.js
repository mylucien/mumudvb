'use strict';
'require view';
'require fs';
'require ui';

/*
 * 原始配置文件编辑页
 * 用于 main.custom=1 时直接编辑 /etc/mumudvb/mumudvb.conf。
 */

var FILE = '/etc/mumudvb/mumudvb.conf';
var SAMPLE = '/etc/mumudvb/mumudvb.conf.sample';

return view.extend({
	load: function () {
		return fs.read(FILE).then(function (data) {
			return { content: data || '' };
		}).catch(function () {
			return { content: '' };
		});
	},

	render: function (data) {
		var textarea, self = this;

		textarea = E('textarea', {
			'id': 'mumudvb-conf-editor',
			'class': 'cbi-input-textarea',
			'style': 'width:100%;height:60vh;font-family:monospace;font-size:12px;white-space:pre',
			'spellcheck': 'false',
			'wrap': 'off'
		}, data.content || '');

		function save() {
			return fs.write(FILE, textarea.value).then(function () {
				ui.addNotification(null, E('p', {}, _('Configuration saved. Restart the service to apply it.')));
			}).catch(function (err) {
				ui.addNotification(null, E('p', {}, _('Unable to save: %s').format(err)));
			});
		}

		function loadSample() {
			return fs.read(SAMPLE).then(function (txt) {
				textarea.value = txt;
			}).catch(function () {
				ui.addNotification(null, E('p', {}, _('Sample file not found.')));
			});
		}

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('MuMuDVB configuration file')),
			E('div', { 'class': 'cbi-map-descr' }, [
				E('code', {}, FILE),
				E('br'),
				_('Only used when "Use a custom configuration file" is enabled on the settings page.')
			]),
			E('div', { 'class': 'cbi-section' }, [
				textarea
			]),
			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': ui.createHandlerFn(self, loadSample)
				}, ' ' + _('Load sample') + ' '),
				' ',
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': ui.createHandlerFn(self, save)
				}, ' ' + _('Save') + ' ')
			])
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
