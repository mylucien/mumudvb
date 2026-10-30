'use strict';
'require view';
'require dom';
'require fs';
'require ui';
'require rpc';

/*
 * MuMuDVB 状态页
 *
 * 单独一页，加载即渲染，不依赖任何按钮回调 —— 按钮回调里如果 promise
 * 不 settle，LuCI 的 createHandlerFn 会把按钮永久置灰（disabled + spinning），
 * 表现就是"点了没反应"。
 */

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

function readLog() {
	/* -l 200：只取最后 200 条，crash loop 时日志会刷到几十万字符，
	   全量返回会把浏览器卡住 */
	return fs.exec('/sbin/logread', [ '-l', '200', '-e', 'mumudvb' ]).then(function (res) {
		var out = String((res && res.stdout) || '').trim();

		if (!out.length)
			out = String((res && res.stderr) || '').trim();

		return out;
	}).catch(function (err) {
		return _('Unable to read log: %s').format(err);
	});
}

function query() {
	return Promise.all([
		callServiceList('mumudvb').catch(function () { return {}; }),
		readLog()
	]).then(function (res) {
		var instances = ((res[0] || {}).mumudvb || {}).instances || {};
		var names = Object.keys(instances).sort();

		return {
			rows: names.map(function (name) {
				var inst = instances[name] || {};
				return {
					name: name,
					running: !!inst.running,
					pid: inst.pid || ''
				};
			}),
			log: res[1]
		};
	}).catch(function (err) {
		return { rows: [], log: '', error: String(err) };
	});
}

function renderTable(data) {
	if (data.error)
		return E('p', { 'class': 'alert-message warning' }, data.error);

	if (!data.rows.length)
		return E('p', {}, _('No instance is running.'));

	return E('table', { 'class': 'table' }, [
		E('tr', { 'class': 'tr table-titles' }, [
			E('th', { 'class': 'th' }, _('Instance')),
			E('th', { 'class': 'th' }, _('State')),
			E('th', { 'class': 'th' }, _('PID'))
		]),
		data.rows.map(function (row) {
			return E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, row.name),
				E('td', { 'class': 'td' }, row.running ? _('running') : _('stopped')),
				E('td', { 'class': 'td' }, row.pid ? String(row.pid) : '-')
			]);
		})
	]);
}

function renderBody(data) {
	return E('div', {}, [
		renderTable(data),
		E('h3', {}, _('Log')),
		E('pre', {
			'style': 'max-height:50vh;overflow:auto;white-space:pre-wrap;font-family:monospace;font-size:12px'
		}, data.log.length ? data.log : _('No log entries yet.'))
	]);
}

return view.extend({
	load: function () {
		return query();
	},

	render: function (data) {
		var self = this;
		var box = E('div', {}, renderBody(data));

		function refresh() {
			return query().then(function (d) {
				dom.content(box, renderBody(d));
			});
		}

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('MuMuDVB status')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Per-instance state from procd and the recent mumudvb syslog lines.')),
			E('div', { 'class': 'cbi-section' }, [ box ]),
			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': ui.createHandlerFn(self, refresh)
				}, ' ' + _('Refresh') + ' ')
			])
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
