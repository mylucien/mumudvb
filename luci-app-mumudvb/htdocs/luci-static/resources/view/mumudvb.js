'use strict';
'require view';
'require form';
'require fs';
'require uci';
'require ui';
'require rpc';

/*
 * MuMuDVB 设置页
 *
 * 本页只维护 UCI（/etc/config/mumudvb），真正的 mumudvb 配置文件由
 * /etc/init.d/mumudvb 在启动/重载时生成。
 * UCI 选项名与 mumudvb 配置指令同名，因此这里是 1:1 透传，
 * 想要 mumudvb 的完整能力（模板、逐频道 PID 等）请用"配置文件"页面。
 */

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

function run(cmd, args) {
	return fs.exec(cmd, args || []).then(function (res) {
		return res || {};
	}).catch(function (err) {
		return { code: -1, stdout: '', stderr: String(err) };
	});
}

function showStatus() {
	return Promise.all([
		callServiceList('mumudvb').catch(function () { return {}; }),
		run('/sbin/logread', [ '-e', 'mumudvb' ])
	]).then(function (res) {
		var instances = ((res[0] || {}).mumudvb || {}).instances || {};
		var names = Object.keys(instances).sort();
		var log = String(res[1].stdout || '').trim();
		var body = [];

		if (!log.length)
			log = String(res[1].stderr || '').trim();

		if (names.length) {
			body.push(E('ul', { 'style': 'margin:0 0 12px 0' }, names.map(function (name) {
				var inst = instances[name] || {};
				return E('li', {}, [
					E('strong', {}, name + ': '),
					inst.running ? _('running') : _('stopped'),
					(inst.pid ? ' (pid ' + inst.pid + ')' : '')
				]);
			})));
		}
		else {
			body.push(E('p', {}, [
				E('strong', {}, _('Service state') + ': '),
				_('stopped')
			]));
		}

		body.push(E('pre', {
			'style': 'max-height:45vh;overflow:auto;white-space:pre-wrap;font-family:monospace;font-size:12px'
		}, log.length ? log : _('No log entries yet.')));

		ui.showModal(_('MuMuDVB status'), body, [
			E('button', {
				'class': 'btn',
				'click': ui.hideModal
			}, _('Close'))
		]);
	});
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
		o.inputtitle = _('Show status and log');
		o.inputstyle = 'action';
		o.onclick = function () {
			return showStatus();
		};

		o = s.option(form.Button, '_restart', _('Control'));
		o.inputtitle = _('Restart now');
		o.inputstyle = 'apply';
		o.onclick = function () {
			ui.addNotification(null, E('p', {}, _('Restarting MuMuDVB…')));
			return run('/etc/init.d/mumudvb', [ 'restart' ]).then(function () {
				return showStatus();
			});
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
		o.value('QAM_AUTO', 'QAM AUTO');
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
			_('Default 4242. Browse to http://<router>:<port>/ for the playlist.'));
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
			_('Writes HLS chunks into a directory served by an HTTP server.'));
		o.modalonly = true;

		o = s.option(form.Value, 'hls_storage_dir', _('HLS directory'),
			_('Leave empty for the mumudvb default (/tmp).'));
		o.placeholder = '/tmp/hls';
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

		return m.render();
	}
});
