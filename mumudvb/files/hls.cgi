#!/bin/sh
#
# MuMuDVB HLS 文件服务（uhttpd CGI 网关）
#
# 为什么需要它
# ------------
# uhttpd 的 mime 表是编译进二进制的（mimetypes.h，62 条），既没有 m3u8 也没有
# ts；uhttpd 也没有 -m 参数读外部 mime 文件；能自定义响应的 uhttpd-mod-ucode /
# uhttpd-mod-lua 在裁剪过的固件里通常没装。结果静态服务给 .m3u8 回的是
# application/octet-stream，iOS/Safari 见到这个类型会把列表当文件下载。
#
# 所以把 8090 这个 uhttpd 实例的 docroot 指到一个只含 cgi-bin/ 的目录，
# 所有真实请求先 404，再用 -E 内部转到这里。uhttpd 传给 CGI 的 REQUEST_URI
# 仍是原始路径（PATH_INFO 是空的，实测 SCRIPT_NAME=/cgi-bin/hls、
# PATH_INFO=[]），脚本据此读文件、给出正确 Content-Type。
#
# 顺带修一个上游问题
# ------------------
# mumudvb 写的主播放列表用 "#EXTINF:0,名字" 标台（hls.c:290），而 HLS 规范
# 里 master playlist 只能用 #EXT-X-STREAM-INF，#EXTINF 只属于媒体播放列表。
# Safari / hls.js 判定为非法直接拒绝（VLC 是当普通 m3u 容错掉了，所以才会有
# "VLC 能放、浏览器不能放"的错觉）。这里对 /playlist.m3u8 现转成合法格式。
#
# 注意：4242 端口那个 mumudvb 自带 HTTP 服务不用管，它的 Content-Type 是对的
# （playlist.m3u -> audio/x-mpegurl，bysid/N -> video/mpeg）。

ROOT=/tmp/hls

# init 会把实际使用的 hls_storage_dir 写到这个文件，读它保证两边目录一致；
# 读不到（mumudvb 还没启动过）就回退到默认值。
if [ -r /var/etc/mumudvb/hls_root ]; then
	_r=$(cat /var/etc/mumudvb/hls_root 2>/dev/null)
	[ -n "$_r" ] && [ -d "$_r" ] && ROOT=$_r
fi

uri=${REQUEST_URI:-/}
uri=${uri%%\?*}
uri=${uri%%#*}

# 只接受 ROOT 下的单层文件名：挡掉目录穿越，别把 /tmp 里别的东西读出去
# （/tmp/luci-sessions 是 LuCI 的会话文件，泄露等于交出后台登录态）
case "$uri" in
	*..*)
		printf 'Status: 400 Bad Request\r\nContent-Type: text/plain\r\n\r\nBad Request\n'
		exit 0
		;;
esac

name=${uri#/}
[ -n "$name" ] || name=playlist.m3u8
file="$ROOT/$name"

case "$name" in
	*.*) ext=${name##*.} ;;
	*)   ext='' ;;
esac

# 白名单：不认识的扩展名一律 403，避免 /tmp 里被塞东西后顺带暴露
case "$ext" in
	m3u8|m3u) ctype='application/vnd.apple.mpegurl'; cache='no-cache' ;;
	ts)       ctype='video/mp2t';                    cache='max-age=60' ;;
	m4s)      ctype='video/iso.segment';             cache='max-age=60' ;;
	aac)      ctype='audio/aac';                     cache='max-age=60' ;;
	vtt)      ctype='text/vtt';                      cache='no-cache' ;;
	srt)      ctype='application/x-subrip';          cache='no-cache' ;;
	mp4)      ctype='video/mp4';                     cache='max-age=60' ;;
	json)     ctype='application/json';              cache='no-cache' ;;
	*)        ctype='' ;;
esac

if [ -z "$ctype" ]; then
	printf 'Status: 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nForbidden\n'
	exit 0
fi

if [ ! -f "$file" ]; then
	printf 'Status: 404 Not Found\r\nContent-Type: text/plain\r\n\r\nNot Found\n'
	exit 0
fi

# 把 mumudvb 那个不合规的 master 转成标准写法
transform_master() {
	_out='#EXTM3U
#EXT-X-VERSION:3'
	_name=''
	while IFS= read -r _line; do
		case "$_line" in
		"#EXTINF:0,"*)
			_name=${_line#\#EXTINF:0,}
			;;
		"#"*|"")
			;;
		*)
			_out="$_out
#EXT-X-STREAM-INF:BANDWIDTH=12000000,NAME=\"$_name\"
$_line"
			;;
		esac
	done < "$1"
	printf '%s' "$_out"
}

if [ "$name" = "playlist.m3u8" ]; then
	_out=$(transform_master "$file")
	size=$(printf '%s\n' "$_out" | wc -c)
	mode=string
else
	size=$(wc -c < "$file" 2>/dev/null)
	[ -n "$size" ] || size=0
	mode=file
fi

printf 'Content-Type: %s\r\n' "$ctype"
printf 'Content-Length: %s\r\n' "$size"
printf 'Cache-Control: %s\r\n' "$cache"
printf '\r\n'

# HEAD 只要头，不读文件内容
[ "$REQUEST_METHOD" = "HEAD" ] && exit 0

if [ "$mode" = "string" ]; then
	printf '%s\n' "$_out"
else
	cat "$file"
fi
