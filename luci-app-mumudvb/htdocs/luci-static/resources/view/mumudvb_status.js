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

/* 与 /etc/uci-defaults/95-mumudvb-hls 里的 listen_http 对应 */
var HLS_PORT = '8090';

/*
 * 探 HLS 网关是否可达。
 *
 * 用 mode:'no-cors'：这个网关是 CGI，不返回 Access-Control-Allow-Origin，
 * 普通 fetch 会被浏览器拦掉，就分不清"服务没起"和"CORS 拒绝"了。
 * no-cors 下拿不到响应内容，但网络层失败仍然会 reject，判断可达性够用。
 */
function probeHls() {
	return window.fetch(
		'http://' + window.location.hostname + ':' + HLS_PORT + '/playlist.m3u8',
		{ mode: 'no-cors', cache: 'no-store' }
	).then(function () {
		return true;
	}).catch(function () {
		return false;
	});
}

/*
 * HLS 目录和占用。目录来自 init 写的 hls_root，而不是写死 /tmp/hls ——
 * 用户改过 hls_storage_dir 时这里要跟着变。
 */
function readHlsInfo() {
	return fs.read('/var/etc/mumudvb/hls_root').then(function (res) {
		var dir = String(res || '').trim();

		if (!dir)
			return { dir: '', size: '' };

		return fs.exec('/usr/bin/du', [ '-sh', dir ]).then(function (r) {
			var out = String((r && r.stdout) || '').trim();

			return { dir: dir, size: out ? out.split(/\s+/)[0] : '' };
		}).catch(function () {
			return { dir: dir, size: '' };
		});
	}).catch(function () {
		return { dir: '', size: '' };
	});
}

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
		readLog(),
		probeHls(),
		readHlsInfo()
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
			log: res[1],
			hlsUp: res[2],
			hlsDir: (res[3] || {}).dir || '',
			hlsSize: (res[3] || {}).size || ''
		};
	}).catch(function (err) {
		return { rows: [], log: '', error: String(err), hlsUp: false, hlsDir: '', hlsSize: '' };
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

function renderGateway(data) {
	var rows = [
		E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, _('HLS gateway')),
			E('td', { 'class': 'td' }, data.hlsUp
				? _('reachable on port %s').format(HLS_PORT)
				: _('not reachable — check the mumudvb_hls instance in /etc/config/uhttpd'))
		])
	];

	rows.push(E('tr', { 'class': 'tr' }, [
		E('td', { 'class': 'td' }, _('HLS directory')),
		E('td', { 'class': 'td' }, data.hlsDir
			? data.hlsDir + (data.hlsSize ? ' (' + data.hlsSize + ')' : '')
			: _('unknown — the service has not been started yet'))
	]));

	return E('table', { 'class': 'table' }, rows);
}

function renderBody(data) {
	return E('div', {}, [
		renderTable(data),
		E('h3', {}, _('Output')),
		renderGateway(data),
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
