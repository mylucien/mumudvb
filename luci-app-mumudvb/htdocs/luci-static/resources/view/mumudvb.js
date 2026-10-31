'use strict';
'require view';
'require form';
'require fs';
'require uci';
'require ui';

/*
 * MuMuDVB 设置页
 *
 * 本页只维护 UCI（/etc/config/mumudvb），真正的 mumudvb 配置文件由
 * /etc/init.d/mumudvb 在启动/重载时生成。
 * UCI 选项名与 mumudvb 配置指令同名，因此这里是 1:1 透传，
 * 想要 mumudvb 的完整能力（模板、逐频道 PID 等）请用"配置文件"页面。
 *
 * 注意：这里刻意不在 onclick 里做异步 UI（弹窗/拉日志）。
 * LuCI 的 ui.createHandlerFn 会先把按钮 disabled + spinning，等 promise
 * settle 才恢复；一旦 promise 抛错或挂住，按钮就永久灰掉，看起来就是
 * "点了没反应"。所以状态信息放到独立的 view/mumudvb_status.js 页面上。
 */

var STATUS_PAGE = 'admin/services/mumudvb/status';

/* HLS 网关端口，和 /etc/uci-defaults/95-mumudvb-hls 里的 listen_http 对应 */
var HLS_PORT = '8090';

function urlFor(port, path) {
	return 'http://' + window.location.hostname + (port ? ':' + port : '') + path;
}

/* navigator.clipboard 只在安全上下文可用，而 LuCI 一般跑在 http://<ip>，
   所以必须有 execCommand 这条回退路径，否则按钮在 http 下完全没反应 */
function copyText(text) {
	if (window.isSecureContext && window.navigator.clipboard) {
		window.navigator.clipboard.writeText(text).catch(function () {});
	}
	else {
		var ta = document.createElement('textarea');
		ta.value = text;
		ta.style.position = 'fixed';
		ta.style.left = '-9999px';
		document.body.appendChild(ta);
		ta.select();
		try { document.execCommand('copy'); } catch (e) {}
		document.body.removeChild(ta);
	}

	ui.addNotification(null, E('p', {}, _('Copied: %s').format(text)), 'info');
}

/* 带超时的 fetch + JSON。不套超时的话，服务没起时这个请求会挂很久 */
function fetchJSON(url, ms) {
	return new Promise(function (resolve, reject) {
		var ctl = null, timer;

		if (typeof AbortController !== 'undefined') {
			ctl = new AbortController();
			timer = window.setTimeout(function () { ctl.abort(); }, ms);
		}
		else {
			timer = window.setTimeout(function () { reject(new Error('timeout')); }, ms);
		}

		window.fetch(url, ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' })
			.then(function (r) {
				if (!r.ok) throw new Error('HTTP ' + r.status);
				return r.json();
			})
			.then(function (j) { window.clearTimeout(timer); resolve(j); })
			.catch(function (e) { window.clearTimeout(timer); reject(e); });
	});
}

function restartService() {
	return fs.exec('/etc/init.d/mumudvb', [ 'restart' ]).then(function (res) {
		var code = (res && res.code != null) ? res.code : -1;

		if (code === 0) {
			ui.addNotification(null, E('p', {}, _('MuMuDVB restarted.')));
		}
		else {
			var msg = String((res && res.stderr) || '').trim();
			ui.addNotification(null, E('p', {},
				_('Restart failed (code %d).').format(code) + (msg ? ' ' + msg : '')));
		}
	}).catch(function (err) {
		ui.addNotification(null, E('p', {}, _('Restart failed: %s').format(err)));
	});
}

/*
 * 「输出地址」卡片：三个总入口，纯静态推算，不等服务起来。
 *
 * 刻意不用 cbi-section-node 装这一块：部分主题里它是
 * display:flex; flex-direction:column（argon），子元素会被 stretch 拉满整行。
 */
function sectionLinks(tuner) {
	var sec = E('div', { 'class': 'cbi-section' }, [ E('h3', {}, _('Output addresses')) ]);

	if (!tuner) {
		sec.appendChild(E('p', { 'class': 'cbi-value-description' }, _('Add a tuner first.')));
		return sec;
	}

	var cfg = tuner['.name'];
	var uport = uci.get('mumudvb', cfg, 'port_http') || '4242';
	var uOn = uci.get('mumudvb', cfg, 'unicast') === '1';
	var hOn = uci.get('mumudvb', cfg, 'hls') === '1';

	function line(kind, desc, url, enabled, note) {
		var td = E('td', { 'class': 'td' });

		if (enabled) {
			td.appendChild(E('a', { 'href': url, 'target': '_blank', 'rel': 'noopener' }, url));
			td.appendChild(E('button', {
				'type': 'button',
				'class': 'btn cbi-button',
				'style': 'margin-inline-start:.5rem;flex:0 0 auto;width:auto',
				'click': function (ev) {
					ev.preventDefault();
					ev.stopPropagation();
					copyText(url);
				}
			}, _('Copy')));
		}
		else {
			td.appendChild(E('span', { 'style': 'opacity:.55' }, url));
			td.appendChild(E('span', { 'style': 'opacity:.55;margin-inline-start:.5rem' },
				note || _('not enabled')));
		}

		return E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'style': 'white-space:nowrap' }, kind),
			E('td', { 'class': 'td' }, desc),
			td
		]);
	}

	var tbl = E('table', { 'class': 'table' }, [
		E('tr', { 'class': 'tr table-titles' }, [
			E('th', { 'class': 'th' }, _('Type')),
			E('th', { 'class': 'th' }, _('What it is')),
			E('th', { 'class': 'th' }, _('Address'))
		]),
		line(_('HTTP unicast'), _('Raw TS per channel, lowest latency, no disk use.'),
			urlFor(uport, '/playlist.m3u'), uOn),
		line(_('HLS'), _('Segment based, works in browsers; served by the gateway on port %s.').format(HLS_PORT) + ' ' +
			_('iOS Safari may refuse streams whose audio is AC3 — use the HTTP unicast URL there instead.'),
			urlFor(HLS_PORT, '/playlist.m3u8'), hOn)
	]);

	sec.appendChild(tbl);
	sec.appendChild(E('p', { 'class': 'cbi-value-description' },
		_('Multicast groups are generated from the autoconf_ip4 template; see the Multicast column below.')));

	return sec;
}

/*
 * 「频道与链接」卡片：从 mumudvb 自己的 4242 取 channels_list.json。
 * 那边带 Access-Control-Allow-Origin: *，所以浏览器跨端口也能直接读。
 */
function sectionChannels(tuner) {
	var sec = E('div', { 'class': 'cbi-section' }, [ E('h3', {}, _('Channels and links')) ]);
	var box = E('div', {});

	sec.appendChild(box);

	if (!tuner) {
		box.appendChild(E('p', { 'class': 'cbi-value-description' }, _('Add a tuner first.')));
		return sec;
	}

	var cfg = tuner['.name'];
	var uport = uci.get('mumudvb', cfg, 'port_http') || '4242';

	box.appendChild(E('p', { 'class': 'cbi-value-description' }, _('Reading channels…')));

	fetchJSON(urlFor(uport, '/channels_list.json'), 2500).then(function (list) {
		box.innerHTML = '';

		if (!Array.isArray(list) || !list.length) {
			box.appendChild(E('p', { 'class': 'cbi-value-description' }, _('No channel discovered yet.')));
			return;
		}

		var rows = [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, '#'),
				E('th', { 'class': 'th' }, _('Name')),
				E('th', { 'class': 'th' }, _('SID')),
				E('th', { 'class': 'th' }, _('Multicast')),
				E('th', { 'class': 'th' }, _('HTTP TS')),
				E('th', { 'class': 'th' }, _('HLS'))
			])
		];

		list.forEach(function (c) {
			var sid = c.service_id;

			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, String(c.number)),
				E('td', { 'class': 'td' }, c.name + (c.is_up ? '' : ' ' + _('(not ready)'))),
				E('td', { 'class': 'td' }, String(sid)),
				E('td', { 'class': 'td' }, c.ip_multicast + ':' + c.port_multicast),
				E('td', { 'class': 'td' }, E('a', {
					'href': urlFor(uport, '/bysid/' + sid), 'target': '_blank', 'rel': 'noopener'
				}, '/bysid/' + sid)),
				E('td', { 'class': 'td' }, E('a', {
					'href': urlFor(HLS_PORT, '/' + sid + '.m3u8'), 'target': '_blank', 'rel': 'noopener'
				}, sid + '.m3u8'))
			]));
		});

		box.appendChild(E('table', { 'class': 'table' }, rows));
	}).catch(function () {
		box.innerHTML = '';
		box.appendChild(E('p', { 'class': 'cbi-value-description' },
			_('Cannot read the channel list — HTTP unicast is disabled, the service is not running, or the port is not %s.').format(uport)));
	});

	return sec;
}

return view.extend({
	load: function () {
		return uci.load('mumudvb');
	},

	render: function () {
		var m, s, o;

		m = new form.Map('mumudvb', _('MuMuDVB'),
			_('Streams a DVB/ATSC transponder to the LAN as multicast, HTTP unicast TS or HLS.') + ' ' +
			_('The real configuration file is generated from this page on every service start.'));

		/* ------------------------------------------------------------------ */
		/* 全局                                                               */
		/* ------------------------------------------------------------------ */
		s = m.section(form.NamedSection, 'main', 'mumudvb', _('General'));

		o = s.option(form.Flag, 'enabled', _('Enable MuMuDVB'),
			_('Master switch. When disabled no instance is started at all.'));
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.Flag, 'custom', _('Use a custom configuration file'),
			_('Ignore all tuner sections below and start a single instance with the given file.') + ' ' +
			_('The file can be edited on the configuration page.'));
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.Value, 'custom_file', _('Configuration file path'));
		o.default = '/etc/mumudvb/mumudvb.conf';
		o.datatype = 'string';
		o.depends('custom', '1');
		o.rmempty = false;

		o = s.option(form.Button, '_status', _('Service'));
		o.inputtitle = _('Status and log');
		o.inputstyle = 'action';
		o.onclick = function () {
			/* 直接跳转到独立的状态页：不涉及异步 UI，
			   不会出现按钮被 disabled 后卡住的情况 */
			window.location.href = L.url(STATUS_PAGE);
			return Promise.resolve();
		};

		o = s.option(form.Button, '_restart', _('Control'));
		o.inputtitle = _('Restart now');
		o.inputstyle = 'apply';
		o.onclick = function () {
			return restartService();
		};

		/* ------------------------------------------------------------------ */
		/* 调谐器                                                             */
		/* ------------------------------------------------------------------ */
		s = m.section(form.GridSection, 'tuner', _('Tuners'),
			_('One entry per DVB frontend. Each entry starts one mumudvb process.') + ' ' +
			_('Click Edit to change the detailed parameters.'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.addbtntitle = _('Add tuner');
		s.modaltitle = _('Tuner settings');

		/* --- 表格列 --- */
		o = s.option(form.Value, 'name', _('Name'));
		o.placeholder = 'DVB-T 474';
		o.rmempty = false;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.ListValue, 'delivery_system', _('Delivery system'));
		o.value('DVBT', _('DVB-T (terrestrial)'));
		o.value('DVBT2', _('DVB-T2 (terrestrial)'));
		o.value('DVBC_ANNEX_AC', _('DVB-C (cable)'));
		o.value('DVBS', _('DVB-S (satellite)'));
		o.value('DVBS2', _('DVB-S2 (satellite)'));
		o.value('ATSC', _('ATSC (North America)'));
		o.default = 'DVBT';

		o = s.option(form.Value, 'freq', _('Frequency'),
			_('Terrestrial/cable: MHz (474) or Hz (474000000). Satellite: MHz (11987).'));
		o.placeholder = '474';
		o.datatype = 'string';
		o.rmempty = false;

		/* --- 模态框里的详细参数 --- */
		o = s.option(form.Value, 'card', _('Adapter index'),
			_('Corresponds to /dev/dvb/adapterN.'));
		o.default = '0';
		o.datatype = 'uinteger';
		o.modalonly = true;

		o = s.option(form.Value, 'tuner', _('Frontend index'),
			_('Only needed for cards with more than one frontend.'));
		o.default = '0';
		o.datatype = 'uinteger';
		o.modalonly = true;

		o = s.option(form.ListValue, 'autoconfiguration', _('Autoconfiguration'),
			_('"full" discovers every service of the transponder and follows PID changes.'));
		o.value('full', _('full (recommended)'));
		o.value('none', _('none (manual channels)'));
		o.default = 'full';
		o.modalonly = true;

		o = s.option(form.Value, 'autoconf_ip4', _('Multicast address template'),
			_('e.g. 239.100.%card.%number — %number is the channel number, %card the adapter.'));
		o.default = '239.100.%card.%number';
		o.modalonly = true;

		o = s.option(form.Value, 'autoconf_name_template', _('Channel name template'),
			_('e.g. %number-%name'));
		o.datatype = 'string';
		o.modalonly = true;

		o = s.option(form.Value, 'autoconf_sid_list_ignore', _('Ignore service IDs'),
			_('Space separated list of SIDs to skip.'));
		o.modalonly = true;

		/* DVB-T / DVB-T2 */
		o = s.option(form.ListValue, 'bandwidth', _('Bandwidth'));
		o.value('8MHz', '8 MHz');
		o.value('7MHz', '7 MHz');
		o.value('6MHz', '6 MHz');
		o.value('5MHz', '5 MHz');
		o.value('10MHz', '10 MHz');
		o.default = '8MHz';
		o.depends('delivery_system', 'DVBT');
		o.depends('delivery_system', 'DVBT2');
		o.modalonly = true;

		o = s.option(form.ListValue, 'trans_mode', _('Transmission mode'));
		o.value('auto', _('auto'));
		o.value('2k', '2k');
		o.value('8k', '8k');
		o.value('4k', '4k');
		o.value('16k', '16k');
		o.value('32k', '32k');
		o.depends('delivery_system', 'DVBT');
		o.depends('delivery_system', 'DVBT2');
		o.modalonly = true;

		o = s.option(form.ListValue, 'guardinterval', _('Guard interval'));
		o.value('auto', _('auto'));
		o.value('1/32', '1/32');
		o.value('1/16', '1/16');
		o.value('1/8', '1/8');
		o.value('1/4', '1/4');
		o.depends('delivery_system', 'DVBT');
		o.depends('delivery_system', 'DVBT2');
		o.modalonly = true;

		/* 有线 / 卫星共用 */
		o = s.option(form.Value, 'srate', _('Symbol rate'),
			_('Cable and satellite only, in kSym/s (e.g. 6875 or 27500).'));
		o.datatype = 'uinteger';
		o.depends('delivery_system', 'DVBC_ANNEX_AC');
		o.depends('delivery_system', 'DVBS');
		o.depends('delivery_system', 'DVBS2');
		o.modalonly = true;

		o = s.option(form.ListValue, 'modulation', _('Modulation'));
		o.value('QAM64', 'QAM64');
		o.value('QAM128', 'QAM128');
		o.value('QAM256', 'QAM256');
		o.value('QAMAUTO', _('QAM auto'));
		o.value('QPSK', 'QPSK');
		o.value('8PSK', '8PSK');
		o.depends('delivery_system', 'DVBC_ANNEX_AC');
		o.depends('delivery_system', 'DVBS2');
		o.modalonly = true;

		/* 卫星 */
		o = s.option(form.ListValue, 'pol', _('Polarisation'));
		o.value('h', _('horizontal'));
		o.value('v', _('vertical'));
		o.value('l', _('left circular'));
		o.value('r', _('right circular'));
		o.depends('delivery_system', 'DVBS');
		o.depends('delivery_system', 'DVBS2');
		o.modalonly = true;

		o = s.option(form.Value, 'sat_number', _('DiSEqC satellite number'),
			_('0 = no DiSEqC, 1..4 = Position/Option A..B'));
		o.datatype = 'range(0,4)';
		o.depends('delivery_system', 'DVBS');
		o.depends('delivery_system', 'DVBS2');
		o.modalonly = true;

		o = s.option(form.ListValue, 'lnb_type', _('LNB type'));
		o.value('universal', _('universal (9750/10600)'));
		o.value('standard', _('standard (single LO)'));
		o.depends('delivery_system', 'DVBS');
		o.depends('delivery_system', 'DVBS2');
		o.modalonly = true;

		o = s.option(form.Value, 'lnb_lof_low', _('LNB low LO'),
			_('MHz, universal LNB only, default 9750.'));
		o.datatype = 'uinteger';
		o.depends('delivery_system', 'DVBS');
		o.depends('delivery_system', 'DVBS2');
		o.modalonly = true;

		o = s.option(form.Value, 'lnb_lof_high', _('LNB high LO'),
			_('MHz, universal LNB only, default 10600.'));
		o.datatype = 'uinteger';
		o.depends('delivery_system', 'DVBS');
		o.depends('delivery_system', 'DVBS2');
		o.modalonly = true;

		o = s.option(form.ListValue, 'switch_type', _('Switch type'));
		o.value('C', _('Committed'));
		o.value('U', _('Uncommitted'));
		o.value('B', _('Both'));
		o.value('N', _('Unicable'));
		o.depends('delivery_system', 'DVBS');
		o.depends('delivery_system', 'DVBS2');
		o.modalonly = true;

		o = s.option(form.Value, 'switch_input', _('Switch input'),
			_('0..31, overrides the DiSEqC satellite number.'));
		o.datatype = 'range(0,31)';
		o.depends('delivery_system', 'DVBS');
		o.depends('delivery_system', 'DVBS2');
		o.modalonly = true;

		/* 网络输出 */
		o = s.option(form.Flag, 'unicast', _('HTTP unicast'),
			_('Serves every channel as an HTTP TS stream plus a playlist and a status page.'));
		o.modalonly = true;

		o = s.option(form.Value, 'port_http', _('HTTP port'),
			_('Default 4242. / is the index page, /playlist.m3u the playlist, /bynumber/1 the first channel.'));
		o.default = '4242';
		o.datatype = 'port';
		o.depends('unicast', '1');
		o.modalonly = true;

		o = s.option(form.Value, 'common_port', _('Multicast port'));
		o.default = '1234';
		o.datatype = 'port';
		o.modalonly = true;

		o = s.option(form.Value, 'multicast_ttl', _('Multicast TTL'),
			_('1 = local network only.'));
		o.default = '2';
		o.datatype = 'range(1,255)';
		o.modalonly = true;

		o = s.option(form.Value, 'multicast_iface4', _('Multicast interface'),
			_('Interface to send multicast on, e.g. br-lan. Empty = system default.'));
		o.modalonly = true;

		o = s.option(form.Flag, 'rtp_header', _('RTP headers (multicast only)'));
		o.modalonly = true;

		o = s.option(form.Flag, 'sap', _('SAP announcements'),
			_('Lets VLC and set-top boxes discover the streams automatically.'));
		o.modalonly = true;

		o = s.option(form.Value, 'sap_default_group', _('SAP playlist group'));
		o.depends('sap', '1');
		o.modalonly = true;

		o = s.option(form.Flag, 'hls', _('HLS output'),
			_('Writes HLS chunks to disk so a web server can serve them.') + ' ' +
			_('mumudvb itself does not expose .m3u8/.ts over its own HTTP port; this package adds a dedicated uhttpd instance on port 8090 for it.'));
		o.modalonly = true;

		o = s.option(form.Value, 'hls_storage_dir', _('HLS directory'),
			_('Chunks are written here and served by the uhttpd instance on port 8090, so this must stay /tmp/hls unless you also change that instance.'));
		o.placeholder = '/tmp/hls';
		o.depends('hls', '1');
		o.modalonly = true;

		o = s.option(form.ListValue, 'hls_rotate_time', _('HLS segment length'),
			_('Seconds per chunk. The directory lives on tmpfs, so longer chunks cost RAM: 10 s takes about 120 MB for three HD services, 2 s about 25 MB. Shorter also means lower latency.'));
		o.value('2', _('2 s (recommended)'));
		o.value('4', '4 s');
		o.value('6', '6 s');
		o.value('10', _('10 s (mumudvb default)'));
		o.default = '2';
		o.depends('hls', '1');
		o.modalonly = true;

		/* 其他 */
		o = s.option(form.Flag, 'rewrite_pat', _('Rewrite PAT'));
		o.modalonly = true;

		o = s.option(form.Flag, 'rewrite_sdt', _('Rewrite SDT'));
		o.modalonly = true;

		o = s.option(form.Value, 'dvr_buffer_size', _('DVR buffer size'),
			_('In TS packets, default 20. Raise it for T2-MI or high bitrate muxes.'));
		o.datatype = 'uinteger';
		o.modalonly = true;

		o = s.option(form.ListValue, 'log_type', _('Log destination'));
		o.value('console', _('console (captured by procd/syslog)'));
		o.value('syslog', _('syslog'));
		o.modalonly = true;

		return m.render().then(function (formNode) {
			var tuners = uci.sections('mumudvb', 'tuner') || [];
			var tuner = tuners[0];

			return E('div', {}, [
				formNode,
				sectionLinks(tuner),
				sectionChannels(tuner)
			]);
		});
	}
});
