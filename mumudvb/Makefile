#
# MuMuDVB - DVB/ATSC -> IPTV (multicast / HTTP unicast / HLS) streamer
#
# Copyright (C) 2026
#
# This is free software, licensed under the GNU General Public License v2.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=mumudvb
PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/braice/MuMuDVB.git
PKG_SOURCE_VERSION:=ce2db87f2341b73e639d3248de7a841339d91716
PKG_SOURCE_DATE:=2026-09-13
PKG_VERSION:=2.1.0+git20260913
PKG_RELEASE:=1
PKG_MIRROR_HASH:=skip

PKG_LICENSE:=GPL-2.0-or-later
PKG_LICENSE_FILES:=COPYING
PKG_MAINTAINER:=

PKG_FIXUP:=autoreconf
PKG_INSTALL:=1
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

include $(INCLUDE_DIR)/package.mk

define Package/mumudvb
  SECTION:=multimedia
  CATEGORY:=Multimedia
  TITLE:=DVB/ATSC to IPTV streamer (multicast, HTTP unicast, HLS)
  URL:=https://mumudvb.net/
endef

define Package/mumudvb/description
 MuMuDVB redistributes a whole DVB/ATSC transponder over the network.
 Every service of the transponder is mapped to its own multicast group,
 HTTP unicast TS stream (with an XML/JSON status page and M3U playlist)
 or HLS output. Autoconfiguration detects the services, their PIDs and
 names and follows changes at runtime.
endef

#
# CAM support needs libdvben50221/libucsi (dvb-apps), SCAM needs libdvbcsa
# and oscam, neither of them are available in the OpenWrt feeds.
# ARIB is only needed for ISDB-T (Japan). All three are disabled here.
#
CONFIGURE_ARGS += \
	--disable-cam-support \
	--disable-scam-support \
	--disable-arib-support \
	--disable-duma \
	--disable-coverage

define Package/mumudvb/conffiles
/etc/config/mumudvb
endef

define Package/mumudvb/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/mumudvb $(1)/usr/bin/mumudvb

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/mumudvb.config $(1)/etc/config/mumudvb

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/mumudvb.init $(1)/etc/init.d/mumudvb

	$(INSTALL_DIR) $(1)/etc/mumudvb
	$(INSTALL_DATA) ./files/mumudvb.conf.sample $(1)/etc/mumudvb/mumudvb.conf.sample
endef

$(eval $(call BuildPackage,mumudvb))
